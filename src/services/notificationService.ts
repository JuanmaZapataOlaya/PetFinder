import type { AppNotification } from '@/types'
import { supabase } from './supabase'

function mapNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id), recipientUserId: String(row.recipient_user_id), senderUserId: row.sender_user_id ? String(row.sender_user_id) : undefined,
    reportId: Number(row.report_id), type: row.type as AppNotification['type'], title: String(row.title), message: String(row.message || ''),
    senderName: row.sender_name ? String(row.sender_name) : undefined, senderPhone: row.sender_phone ? String(row.sender_phone) : undefined,
    senderEmail: row.sender_email ? String(row.sender_email) : undefined, petImage: row.pet_image ? String(row.pet_image) : undefined,
    createdAt: new Date(String(row.created_at)).getTime(), read: Boolean(row.read),
  }
}

export async function getNotifications(userId: string) {
  const { data, error } = await supabase.from('app_notifications').select('*').eq('recipient_user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data as Record<string, unknown>[]).map(mapNotification)
}

export async function updateNotificationRead(userId: string, notificationId: string, read: boolean): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('app_notifications').update({ read }).eq('id', notificationId).eq('recipient_user_id', userId)
  return error ? { success: false, error: error.message } : { success: true }
}

export async function deleteNotification(userId: string, notificationId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('app_notifications').delete().eq('id', notificationId).eq('recipient_user_id', userId)
  return error ? { success: false, error: error.message } : { success: true }
}

export async function sendContactRequest(payload: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): Promise<{ success: boolean; error?: string }> {
  if (!payload.senderUserId || payload.senderUserId === payload.recipientUserId) return { success: false, error: 'No puedes enviarte una solicitud a ti mismo.' }
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: duplicate, error: duplicateError } = await supabase.from('app_notifications').select('id').eq('sender_user_id', payload.senderUserId).eq('report_id', payload.reportId).gte('created_at', since).limit(1)
  if (duplicateError) return { success: false, error: duplicateError.message }
  if (duplicate?.length) return { success: false, error: 'Ya enviaste una solicitud de contacto para este reporte recientemente (espera 1 hora).' }

  const { data, error } = await supabase.from('app_notifications').insert({
    recipient_user_id: payload.recipientUserId, sender_user_id: payload.senderUserId, report_id: payload.reportId,
    type: payload.type, title: payload.title, message: payload.message, sender_name: payload.senderName,
    sender_phone: payload.senderPhone, sender_email: payload.senderEmail, pet_image: payload.petImage,
  }).select().single()
  if (error) return { success: false, error: error.message }
  const audit = await supabase.from('audit_logs').insert({ action: 'CONTACT_REQUEST_SENT', data: data })
  return audit.error ? { success: false, error: audit.error.message } : { success: true }
}
