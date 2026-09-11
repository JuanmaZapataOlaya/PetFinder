import { describe, expect, it } from 'vitest'
import { otroUsuario, usuario } from './fixtures'

const payload = {
  recipientUserId: usuario.id,
  senderUserId: otroUsuario.id,
  reportId: 4,
  petImage: 'luna.jpg',
  type: 'CONTACT_REQUEST' as const,
  title: 'Solicitud',
  message: 'Hola',
  senderName: otroUsuario.name,
  senderPhone: '555',
  senderEmail: otroUsuario.email,
  evidenceImages: [
    { url: 'https://example.com/evidence-1.jpg', path: 'user-2/evidence-1.jpg', contentType: 'image/jpeg' as const },
    { url: 'https://example.com/evidence-2.png', path: 'user-2/evidence-2.png', contentType: 'image/png' as const },
  ],
}

describe('notificationService', () => {
  it('envía, persiste y ordena notificaciones por fecha', async () => {
    const { sendContactRequest, getNotifications } = await import('@/services/notificationService')
    expect(sendContactRequest(payload).success).toBe(true)
    expect(sendContactRequest({ ...payload, reportId: 5 }).success).toBe(true)
    const notifications = getNotifications(usuario.id)
    expect(notifications).toHaveLength(2)
    expect(notifications[0].createdAt).toBeGreaterThanOrEqual(notifications[1].createdAt)
    expect(getNotifications('missing')).toEqual([])
  })

  it('impide auto-contacto y duplicados durante una hora', async () => {
    const { sendContactRequest } = await import('@/services/notificationService')
    expect(sendContactRequest({ ...payload, senderUserId: usuario.id }).error).toContain('ti mismo')
    expect(sendContactRequest(payload).success).toBe(true)
    expect(sendContactRequest(payload).error).toContain('recientemente')
  })

  it('actualiza solo notificaciones pertenecientes al destinatario', async () => {
    const { deleteNotification, sendContactRequest, updateNotificationRead, getNotifications } = await import('@/services/notificationService')
    sendContactRequest(payload)
    const notification = getNotifications(usuario.id)[0]
    expect(updateNotificationRead(usuario.id, notification.id, true).success).toBe(true)
    expect(getNotifications(usuario.id)[0].read).toBe(true)
    expect(updateNotificationRead(otroUsuario.id, notification.id, false).success).toBe(false)
    expect(updateNotificationRead(usuario.id, 'missing', true).error).toContain('No se encontró')
    expect(deleteNotification(otroUsuario.id, notification.id).success).toBe(false)
    expect(deleteNotification(usuario.id, notification.id).success).toBe(true)
    expect(getNotifications(usuario.id)).toEqual([])
    expect(deleteNotification(usuario.id, notification.id).error).toContain('No se encontró')
  })
})
