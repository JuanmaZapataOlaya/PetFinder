import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AuthView from '@/views/AuthView.vue'
import ContactInfoView from '@/views/ContactInfoView.vue'
import NotificationsView from '@/views/NotificationsView.vue'
import { otroUsuario, usuario } from './fixtures'

const { push, login, register, startOAuth, getCurrentUser } = vi.hoisted(() => ({
  push: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  startOAuth: vi.fn(),
  getCurrentUser: vi.fn(),
}))
const { updateNotificationRead, deleteNotification } = vi.hoisted(() => ({
  updateNotificationRead: vi.fn(() => ({ success: true })),
  deleteNotification: vi.fn(() => ({ success: true })),
}))
let currentUser: typeof usuario | null = usuario
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, meta: {} }),
  useRouter: () => ({ push }),
}))
vi.mock('@/services/authService', () => ({
  getCurrentUser,
  login,
  register,
  startOAuth,
  logout: vi.fn(),
  getUserById: () => currentUser,
  verifyEmail: vi.fn(),
}))
vi.mock('@/services/notificationService', () => ({
  getNotifications: () => [{
    id: 'n1',
    recipientUserId: usuario.id,
    senderUserId: otroUsuario.id,
    reportId: 1,
    petImage: 'luna.jpg',
    type: 'CONTACT_REQUEST',
    title: 'Solicitud',
    message: 'Hola',
    senderName: otroUsuario.name,
    senderPhone: '555',
    senderEmail: otroUsuario.email,
    createdAt: Date.now(),
    read: false,
  }],
  updateNotificationRead,
  deleteNotification,
}))
getCurrentUser.mockImplementation(() => currentUser)

describe('formularios y vistas', () => {
  it('muestra errores de login y permite el flujo exitoso', async () => {
    login.mockRejectedValueOnce(new Error('Credenciales inválidas')).mockResolvedValueOnce(usuario)
    const wrapper = mount(AuthView)
    expect(wrapper.text()).not.toContain('92%')
    expect(wrapper.text()).not.toContain('coincidencia en nuestros reportes destacados')
    await wrapper.find('input[type="email"]').setValue(usuario.email)
    await wrapper.find('input[type="password"]').setValue('secreto')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Credenciales inválidas')
    await wrapper.find('form').trigger('submit')
    expect(push).toHaveBeenCalledWith('/resumen')
  })

  it('registra una cuenta y envía al flujo de verificación', async () => {
    register.mockResolvedValueOnce(usuario)
    const wrapper = mount(AuthView)
    await wrapper.find('.auth-switch button').trigger('click')
    await wrapper.find('input[autocomplete="name"]').setValue(usuario.name)
    await wrapper.find('input[type="email"]').setValue(usuario.email)
    await wrapper.find('input[type="password"]').setValue('secreto')
    await wrapper.find('form').trigger('submit')
    expect(push).toHaveBeenCalledWith({ name: 'verify-email', query: { userId: usuario.id } })
  })

  it('carga notificaciones del usuario actual', async () => {
    const wrapper = mount(NotificationsView)
    await Promise.resolve()
    expect(wrapper.text()).toContain('Solicitud')
    expect(wrapper.text()).toContain(otroUsuario.name)
    const card = wrapper.find('.notification-card')
    const buttons = card.findAll('button')
    expect(buttons).toHaveLength(3)
    await buttons[0].trigger('click')
    expect(card.classes()).toContain('notification-card--read')
    expect(card.text()).toContain('Leída')
    expect(updateNotificationRead).toHaveBeenCalledWith(usuario.id, 'n1', true)
    await buttons[1].trigger('click')
    expect(card.classes()).not.toContain('notification-card--read')
    expect(card.text()).toContain('No leída')
    expect(updateNotificationRead).toHaveBeenCalledWith(usuario.id, 'n1', false)
    await card.find('button.notification-action--delete').trigger('click')
    expect(wrapper.text()).toContain('¿Eliminar notificación?')
    expect(wrapper.text()).toContain('Esta acción eliminará permanentemente')
    await wrapper.get('button.danger-button').trigger('click')
    expect(deleteNotification).toHaveBeenCalledWith(usuario.id, 'n1')
    expect(wrapper.find('.notification-card').exists()).toBe(false)
  })

  it('carga y guarda información de contacto válida', async () => {
    const wrapper = mount(ContactInfoView)
    await wrapper.find('#fullName').setValue('Ana Nueva')
    await wrapper.find('#email').setValue('nuevo@example.com')
    await wrapper.find('form').trigger('submit')
    expect(JSON.parse(localStorage.getItem('petfinder_contacts') || '{}')[usuario.id]).toMatchObject({
      fullName: 'Ana Nueva',
      email: 'nuevo@example.com',
    })
    expect(wrapper.text()).toContain('Información actualizada')
  })

  it('valida email inválido y sesión ausente', async () => {
    const wrapper = mount(ContactInfoView)
    await wrapper.find('#email').setValue('correo-invalido')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('formato del correo')
    currentUser = null
    const withoutSession = mount(ContactInfoView)
    await withoutSession.find('form').trigger('submit')
    expect(withoutSession.text()).toContain('Debes iniciar sesión')
  })
})
