import type { RouteRecordRaw } from 'vue-router'
import { ADMIN_PERMISSIONS } from './permissions'

export const adminRoutes: RouteRecordRaw[] = [
  {
    path: '/admin',
    meta: { requiresAuth: true },
    redirect: '/admin/resumen',
    children: [
      { path: 'resumen', name: 'admin-overview', meta: { label: 'Resumen administrativo', roles: ADMIN_PERMISSIONS.resumen }, component: () => import('@/admin/views/AdminOverview.vue') },
      { path: 'reclamos', name: 'admin-claims', meta: { label: 'Reclamos', roles: ADMIN_PERMISSIONS.reclamos }, component: () => import('@/admin/views/AdminClaimsView.vue') },
      { path: 'reportes', name: 'admin-reports', meta: { label: 'Fraude y reportes', roles: ADMIN_PERMISSIONS.reportes }, component: () => import('@/admin/views/AdminReportsView.vue') },
      { path: 'notificaciones-reportadas', name: 'admin-notification-reports', meta: { label: 'Notificaciones reportadas', roles: ADMIN_PERMISSIONS.reportes }, component: () => import('@/admin/views/AdminNotificationsReportsView.vue') },
      { path: 'costos', name: 'admin-costs', meta: { label: 'Costos de modelos', roles: ADMIN_PERMISSIONS.costos }, component: () => import('@/admin/views/AdminCostsView.vue') },
      { path: 'usuarios', name: 'admin-users', meta: { label: 'Usuarios y roles', roles: ADMIN_PERMISSIONS.usuarios }, component: () => import('@/admin/views/AdminUsersView.vue') },
      { path: 'auditoria', name: 'admin-audit', meta: { label: 'Auditoría', roles: ADMIN_PERMISSIONS.auditoria }, component: () => import('@/admin/views/AdminAuditView.vue') },
      { path: 'sin-acceso', name: 'admin-forbidden', meta: { label: 'Sin acceso', requiresAuth: true }, component: () => import('@/admin/views/AdminForbidden.vue') },
    ],
  },
]