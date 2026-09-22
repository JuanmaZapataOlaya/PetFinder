import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { ref } from 'vue'
import { supabase } from './supabase'

export interface AuthUser {
  id: string
  name: string
  email: string
  verified: boolean
  provider: 'password' | 'google' | 'apple'
  photoUrl?: string
  phoneNumber?: string
}

export const AUTH_STATE_CHANGED_EVENT = 'petfinder:auth-changed'
export const currentUser = ref<AuthUser | null>(null)
const CACHED_USER_KEY = 'petfinder.auth.user'

function mapUser(user: User | null, profile?: { name?: string; photo_url?: string } | null): AuthUser | null {
  if (!user) return null
  const provider = (user.app_metadata.provider || 'password') as AuthUser['provider']
  return {
    id: user.id,
    name: profile?.name || user.user_metadata.name || user.email?.split('@')[0] || 'Usuario',
    email: user.email || '',
    verified: Boolean(user.email_confirmed_at),
    provider,
    photoUrl: profile?.photo_url || user.user_metadata.avatar_url,
    phoneNumber: user.user_metadata.phone_number,
  }
}

async function loadProfile(user: User | null) {
  if (!user) return null
  const { data } = await supabase.from('profiles').select('name, photo_url').eq('id', user.id).maybeSingle()
  return mapUser(user, data)
}

function notifyAuthStateChanged() {
  window.dispatchEvent(new Event(AUTH_STATE_CHANGED_EVENT))
}

function readCachedUser() {
  try {
    const cachedUser = localStorage.getItem(CACHED_USER_KEY)
    return cachedUser ? JSON.parse(cachedUser) as AuthUser : null
  } catch {
    return null
  }
}

function cacheUser(user: AuthUser | null) {
  if (!user) return
  localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user))
}

export async function initializeAuth() {
  const cachedUser = readCachedUser()
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      currentUser.value = cachedUser
    } else {
      currentUser.value = mapUser(session.user)
      cacheUser(currentUser.value)
      try {
        currentUser.value = await loadProfile(session.user)
        cacheUser(currentUser.value)
      } catch (error) {
        console.error('No se pudo cargar el perfil de Supabase.', error)
      }
    }
  } catch (error) {
    console.error('No se pudo comprobar la sesión de Supabase.', error)
    currentUser.value = cachedUser
  }

  supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession: Session | null) => {
    if (!nextSession) {
      if (event === 'SIGNED_OUT') {
        currentUser.value = null
        localStorage.removeItem(CACHED_USER_KEY)
        notifyAuthStateChanged()
      }
      return
    }

    currentUser.value = mapUser(nextSession.user)
    cacheUser(currentUser.value)
    notifyAuthStateChanged()
    void loadProfile(nextSession.user)
      .then((user) => {
        currentUser.value = user
        cacheUser(user)
        notifyAuthStateChanged()
      })
      .catch((error) => console.error('No se pudo cargar el perfil de Supabase.', error))
  })
}

export async function register(name: string, email: string, password: string, phoneNumber: string) {
  const normalizedPhone = phoneNumber.trim()
  if (!/^\+[\d ]+$/.test(normalizedPhone) || normalizedPhone.replace(/\D/g, '').length < 8 || normalizedPhone.replace(/\D/g, '').length > 15) {
    throw new Error('Ingresa un número de teléfono válido.')
  }
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { name: name.trim(), phone_number: normalizedPhone } },
  })
  if (error) throw error
  const user = mapUser(data.user)
  if (!user) throw new Error('Supabase no devolvió el usuario registrado.')
  return user
}

export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error) throw error
  currentUser.value = await loadProfile(data.user)
  cacheUser(currentUser.value)
  return currentUser.value
}

export function getCurrentUser() {
  return currentUser.value
}

export async function logout() {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  } finally {
    currentUser.value = null
    localStorage.removeItem(CACHED_USER_KEY)
    notifyAuthStateChanged()
  }
}

export async function verifyEmail() {
  throw new Error('La confirmación se realiza desde el enlace enviado por Supabase Auth.')
}

export async function startOAuth(provider: 'google' | 'apple') {
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } })
  if (error) throw error
}

export async function getUserById(userId: string) {
  const { data, error } = await supabase.from('profiles').select('id, name, photo_url').eq('id', userId).maybeSingle()
  if (error || !data) return null
  return { id: data.id, name: data.name, email: '', verified: false, provider: 'password' as const, photoUrl: data.photo_url || undefined }
}
