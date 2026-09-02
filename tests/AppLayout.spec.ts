import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AppLayout from '@/layouts/AppLayout.vue'

const push = vi.fn()
let currentUser: { id: string; name: string; email: string; photoUrl?: string } | null = null
vi.mock('vue-router', () => ({
  RouterLink: { template: '<a><slot /></a>' },
  useRoute: () => ({ meta: {} }),
  useRouter: () => ({ push }),
}))
vi.mock('@/services/authService', () => ({
  getCurrentUser: () => currentUser,
  logout: vi.fn(),
  AUTH_STATE_CHANGED_EVENT: 'auth',
}))

describe('AppLayout', () => {
  it('muestra la foto autenticada y navega a notificaciones', async () => {
    currentUser = { id: '1', name: 'Ana', email: 'a@b.com', photoUrl: 'ana.jpg' }
    const wrapper = mount(AppLayout)
    expect(wrapper.find('header img').attributes('src')).toBe('ana.jpg')
    await wrapper.find('button[aria-label="Abrir notificaciones"]').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'Notifications' })
  })

  it('usa fallback cuando no hay foto o la imagen falla', async () => {
    currentUser = { id: '1', name: 'Ana', email: 'a@b.com' }
    const wrapper = mount(AppLayout)
    const image = wrapper.find('header img')
    expect(image.attributes('src')).toBe('/avatar-default.svg')
    await image.trigger('error')
    expect(image.attributes('src')).toBe('/avatar-default.svg')
  })

  it('no muestra la navegación protegida sin sesión', () => {
    currentUser = null
    const wrapper = mount(AppLayout)
    expect(wrapper.find('.sidebar').exists()).toBe(false)
    expect(wrapper.find('.app-shell').exists()).toBe(false)
  })

  it('sincroniza la sesión al recibir cambios locales o de autenticación', async () => {
    currentUser = { id: '1', name: 'Ana', email: 'a@b.com' }
    const wrapper = mount(AppLayout)
    currentUser = { id: '2', name: 'Luis', email: 'luis@example.com', photoUrl: 'luis.jpg' }
    window.dispatchEvent(new Event('auth'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('header img').attributes('src')).toBe('luis.jpg')
    currentUser = null
    window.dispatchEvent(new StorageEvent('storage', { key: 'petfinder.session' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.app-shell').exists()).toBe(false)
    wrapper.unmount()
  })
})
