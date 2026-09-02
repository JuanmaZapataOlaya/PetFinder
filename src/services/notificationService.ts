import type { AppNotification } from '@/types'

const NOTIFICATIONS_KEY = 'petfinder_notifications'
const AUDIT_KEY = 'petfinder_audit'
const COOLDOWN_MS = 60 * 60 * 1000 // 1 hora

export function getNotifications(userId: string): AppNotification[] {
  const all: AppNotification[] = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '[]')
  return all
    .filter((notification) => notification.recipientUserId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function updateNotificationRead(userId: string, notificationId: string, read: boolean): { success: boolean; error?: string } {
  const all: AppNotification[] = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '[]')
  const notification = all.find((item) => item.id === notificationId)

  if (!notification || notification.recipientUserId !== userId) {
    return { success: false, error: 'No se encontró la notificación solicitada.' }
  }

  notification.read = read
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(all))
  return { success: true }
}

export function deleteNotification(userId: string, notificationId: string): { success: boolean; error?: string } {
  const all: AppNotification[] = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '[]')
  const notificationIndex = all.findIndex((item) => item.id === notificationId)
  const notification = all[notificationIndex]

  if (!notification || notification.recipientUserId !== userId) {
    return { success: false, error: 'No se encontró la notificación solicitada.' }
  }

  all.splice(notificationIndex, 1)
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(all))
  return { success: true }
}

export function sendContactRequest(payload: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): { success: boolean; error?: string } {
  if (payload.senderUserId === payload.recipientUserId) {
    return { success: false, error: 'No puedes enviarte una solicitud a ti mismo.' }
  }

  const all: AppNotification[] = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '[]')
  
  const now = Date.now()
  const recentDuplicate = all.find(n => 
    n.senderUserId === payload.senderUserId && 
    n.reportId === payload.reportId && 
    (now - n.createdAt) < COOLDOWN_MS
  )

  if (recentDuplicate) {
    return { success: false, error: 'Ya enviaste una solicitud de contacto para este reporte recientemente (espera 1 hora).' }
  }

  const newNotification: AppNotification = {
    ...payload,
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
    createdAt: now,
    read: false
  }

  all.push(newNotification)
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(all))

  // Registro de auditoría
  const auditLogs = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]')
  auditLogs.push({ action: 'CONTACT_REQUEST_SENT', data: newNotification, timestamp: now })
  localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLogs))

  return { success: true }
}