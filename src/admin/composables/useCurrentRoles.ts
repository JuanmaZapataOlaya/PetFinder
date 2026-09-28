import { computed, ref } from 'vue'
import { AUTH_STATE_CHANGED_EVENT, getCurrentUser } from '@/services/authService'
import { supabase } from '@/services/supabase'
import { hasAnyRole as hasAnyRequiredRole, STAFF_ROLES } from '@/admin/permissions'

const roles = ref<string[]>([])
const ready = ref(false)
let loadedUserId: string | null = null
let loading: Promise<void> | null = null

async function loadRoles() {
  const user = getCurrentUser()
  if (!user) {
    roles.value = []
    loadedUserId = null
    ready.value = true
    return
  }

  if (loadedUserId === user.id && ready.value) return
  if (loading) return loading

  ready.value = false
  loading = Promise.resolve(supabase.rpc('get_my_roles')).then(({ data, error }) => {
    if (error) throw error
    roles.value = Array.isArray(data) ? data : []
    loadedUserId = user.id
  }).catch((error) => {
    roles.value = []
    loadedUserId = user.id
    console.error('No se pudieron cargar los roles del usuario.', error)
  }).finally(() => {
    ready.value = true
    loading = null
  })

  return loading
}

function invalidateRoles() {
  roles.value = []
  loadedUserId = null
  ready.value = false
  void loadRoles()
}

if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_STATE_CHANGED_EVENT, invalidateRoles)
}

export function useCurrentRoles() {
  if (!ready.value && !loading) void loadRoles()

  return {
    roles,
    ready,
    isStaff: computed(() => hasAnyRequiredRole(roles.value, STAFF_ROLES)),
    hasAnyRole: (requiredRoles: readonly string[]) => hasAnyRequiredRole(roles.value, requiredRoles),
    loadRoles,
  }
}