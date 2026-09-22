import { createRouter, createWebHistory } from 'vue-router'
import { getCurrentUser } from '@/services/authService'
import ContactInfoView from '@/views/ContactInfoView.vue'
import NotificationsView from '@/views/NotificationsView.vue'
import PetHistoryView from '@/views/PetHistoryView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/resumen' },
    { path: '/resumen', name: 'summary', meta: { label: 'Resumen' }, component: () => import('@/views/DashboardView.vue') },
    { path: '/explorar', name: 'explore', meta: { label: 'Explorar reportes' }, component: () => import('@/views/ExploreReportsView.vue') },
    { path: '/reportes', name: 'reports', meta: { label: 'Mis reportes' }, component: () => import('@/views/ReportsView.vue') },
    { path: '/coincidencias', redirect: { name: 'explore' } },
    { path: '/login', name: 'login', component: () => import('@/views/AuthView.vue') },
    { path: '/verificar-email', name: 'verify-email', component: () => import('@/views/VerifyEmailView.vue') },
    { path: '/contact-info', name: 'ContactInfo', component: ContactInfoView, meta: { requiresAuth: true } },
    { path: '/notifications', name: 'Notifications', component: NotificationsView, meta: { label: 'Notificaciones', requiresAuth: true } },
    { path: '/historial-mascotas', name: 'PetHistory', component: PetHistoryView, meta: {} }
  ],
})

router.beforeEach((to) => {
  const user = getCurrentUser()
  if ((to.meta.requiresAuth || to.meta.label) && !user) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.name === 'login' && user) return '/resumen'
})

export default router