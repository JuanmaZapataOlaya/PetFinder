export interface AuthUser {
  id: string
  name: string
  email: string
  passwordHash: string
  verified: boolean
  provider: 'password' | 'google' | 'apple'
  photoUrl?: string
}

const USERS_KEY = 'petfinder.users'
const SESSION_KEY = 'petfinder.session'
export const AUTH_STATE_CHANGED_EVENT = 'petfinder:auth-changed'

function notifyAuthStateChanged() {
  window.dispatchEvent(new Event(AUTH_STATE_CHANGED_EVENT))
}

function readUsers(): AuthUser[] {
  const raw = localStorage.getItem(USERS_KEY)
  return raw ? JSON.parse(raw) as AuthUser[] : []
}

function writeUsers(users: AuthUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

async function hashPassword(password: string) {
  const data = new TextEncoder().encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function register(name: string, email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const users = readUsers()
  if (users.some((user) => user.email === normalizedEmail)) throw new Error('Ya existe una cuenta con ese email.')
  const user: AuthUser = { id: crypto.randomUUID(), name: name.trim(), email: normalizedEmail, passwordHash: await hashPassword(password), verified: false, provider: 'password' }
  writeUsers([...users, user])
  return user
}

export async function login(email: string, password: string) {
  const user = readUsers().find((candidate) => candidate.email === email.trim().toLowerCase())
  if (!user || user.passwordHash !== await hashPassword(password)) throw new Error('Email o contraseña incorrectos.')
  if (!user.verified) throw new Error('Confirma tu email antes de iniciar sesión.')
  localStorage.setItem(SESSION_KEY, user.id)
  notifyAuthStateChanged()
  return user
}

export function getCurrentUser() {
  const id = localStorage.getItem(SESSION_KEY)
  return readUsers().find((user) => user.id === id) || null
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
  notifyAuthStateChanged()
}

export function verifyEmail(userId: string) {
  const users = readUsers().map((user) => user.id === userId ? { ...user, verified: true } : user)
  writeUsers(users)
}

export function startOAuth(provider: 'google' | 'apple') {
  throw new Error(`La conexión con ${provider === 'google' ? 'Google' : 'Apple'} requiere configurar OAuth en el backend.`)
}

export function getUserById(userId: string) {
  return readUsers().find((user) => user.id === userId) || null
}