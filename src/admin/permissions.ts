export const STAFF_ROLES = ['moderator', 'admin', 'superadmin'] as const
export type AdminRole = typeof STAFF_ROLES[number]

export const ADMIN_PERMISSIONS = {
  resumen: [...STAFF_ROLES],
  reclamos: [...STAFF_ROLES],
  reportes: [...STAFF_ROLES],
  costos: ['admin', 'superadmin'],
  usuarios: ['admin', 'superadmin'],
  auditoria: ['admin', 'superadmin'],
} as const

export function hasAnyRole(userRoles: readonly string[], requiredRoles: readonly string[]) {
  return requiredRoles.some((role) => userRoles.includes(role))
}

export function canAccessAdminSection(userRoles: readonly string[], section: keyof typeof ADMIN_PERMISSIONS) {
  return hasAnyRole(userRoles, ADMIN_PERMISSIONS[section])
}