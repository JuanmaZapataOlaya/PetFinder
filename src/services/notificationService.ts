import type { AppNotification, NotificationEvidenceImage, PetHistoryRecord, PetTicket } from '@/types'
import { supabase } from './supabase'

function mapNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id), recipientUserId: String(row.recipient_user_id), senderUserId: row.sender_user_id ? String(row.sender_user_id) : undefined,
    reportId: Number(row.report_id), type: row.type as AppNotification['type'], title: String(row.title), message: String(row.message || ''),
    senderName: row.sender_name ? String(row.sender_name) : undefined, senderPhone: row.sender_phone ? String(row.sender_phone) : undefined,
    senderEmail: row.sender_email ? String(row.sender_email) : undefined, petImage: row.pet_image ? String(row.pet_image) : undefined,
    evidenceImages: Array.isArray(row.evidence_images) ? row.evidence_images as NotificationEvidenceImage[] : [],
    agentReport: row.agent_report ? String(row.agent_report) : undefined,
    createdAt: new Date(String(row.created_at)).getTime(), read: Boolean(row.read), finalizado: Boolean(row.finalizado),
    reported: Boolean(row.reported), reasonOfReport: row.reason_of_report ? String(row.reason_of_report) : undefined,
  }
}

export async function getNotifications(userId: string) {
  const { data, error } = await supabase.from('app_notifications').select('*').eq('recipient_user_id', userId).eq('finalizado', false).order('created_at', { ascending: false })
  if (error) throw error
  return (data as Record<string, unknown>[]).map(mapNotification)
}

export async function updateNotificationRead(userId: string, notificationId: string, read: boolean): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('app_notifications').update({ read }).eq('id', notificationId).eq('recipient_user_id', userId)
  return error ? { success: false, error: error.message } : { success: true }
}

export async function finalizeNotification(userId: string, notificationId: string): Promise<{ success: boolean; error?: string }> {
  const { data: notification, error: fetchError } = await supabase
    .from('app_notifications')
    .select('report_id')
    .eq('id', notificationId)
    .eq('recipient_user_id', userId)
    .single()

  if (fetchError) return { success: false, error: fetchError.message }
  if (!notification) return { success: false, error: 'Notificación no encontrada' }

  const { error: notifError } = await supabase
    .from('app_notifications')
    .update({ finalizado: true })
    .eq('id', notificationId)
    .eq('recipient_user_id', userId)

  if (notifError) return { success: false, error: notifError.message }

  const { error: ticketError } = await supabase
    .from('pet_tickets')
    .update({ status: 'Resuelta' })
    .eq('id', notification.report_id)

  if (ticketError) return { success: false, error: ticketError.message }

  return { success: true }
}

type HistoryNotificationRow = {
  id: string
  report_id: number
  sender_user_id: string | null
  recipient_user_id: string
  created_at: string
  pet_tickets: PetHistoryTicketRow | PetHistoryTicketRow[] | null
}

type PetHistoryTicketRow = {
  id: number
  owner_id: string
  name: string | null
  type: PetTicket['type']
  kind: PetTicket['kind']
  status: PetTicket['status']
  location: string
  latitude: number
  longitude: number
  image: string
  color: string
  breed: string
  note: string
  match_score: number
  reported_at: string
}

function mapHistoryPet(row: PetHistoryTicketRow): PetTicket {
  const reportedAt = new Date(row.reported_at)
  return {
    id: row.id, ownerId: row.owner_id, name: row.name || '', type: row.type, kind: row.kind, status: row.status,
    location: row.location, latitude: row.latitude, longitude: row.longitude, image: row.image, color: row.color,
    breed: row.breed, note: row.note, match: row.match_score,
    date: reportedAt.toLocaleDateString('es-CO'), timeAgo: reportedAt.toLocaleString('es-CO'),
  }
}

export async function getPetHistory(): Promise<PetHistoryRecord[]> {
  const { data: notificationRows, error: notificationError } = await supabase
    .from('app_notifications')
    .select('id, report_id, sender_user_id, recipient_user_id, created_at, pet_tickets(*)')
    .eq('finalizado', true)
    .order('created_at', { ascending: false })
  if (notificationError) throw notificationError

  const rows = (notificationRows || []) as unknown as HistoryNotificationRow[]
  if (!rows.length) return []

  const userIds = [...new Set(rows.flatMap((row) => {
    const pet = Array.isArray(row.pet_tickets) ? row.pet_tickets[0] : row.pet_tickets
    return pet ? [row.sender_user_id, row.recipient_user_id].filter((id): id is string => Boolean(id)) : []
  }))]
  if (!userIds.length) return []

  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', userIds)
  if (profileError) throw profileError

  const namesById = new Map((profileRows || []).map((row) => [String(row.id), String(row.name)]))
  return rows.flatMap((row) => {
    const ticket = Array.isArray(row.pet_tickets) ? row.pet_tickets[0] : row.pet_tickets
    if (!ticket) return []
    const pet = mapHistoryPet(ticket)
    return [{
      id: row.id, reportId: row.report_id, finalizedAt: new Date(row.created_at).getTime(), pet,
      reporterName: row.sender_user_id ? namesById.get(row.sender_user_id) || 'Usuario reportante' : 'Usuario reportante',
      recipientName: namesById.get(row.recipient_user_id) || 'Usuario receptor',
    }]
  })
}

export async function deleteNotification(userId: string, notificationId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('app_notifications').delete().eq('id', notificationId).eq('recipient_user_id', userId)
  return error ? { success: false, error: error.message } : { success: true }
}

export async function reportNotification(userId: string, notificationId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('app_notifications')
    .update({ reported: true, reason_of_report: reason })
    .eq('id', notificationId)
    .eq('recipient_user_id', userId)
  return error ? { success: false, error: error.message } : { success: true }
}

export async function getReportedNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('app_notifications')
    .select('*')
    .eq('reported', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as Record<string, unknown>[]).map(mapNotification)
}

export async function sendContactRequest(payload: Omit<AppNotification, 'id' | 'createdAt' | 'read' | 'finalizado'>): Promise<{ success: boolean; error?: string }> {
  if (!payload.senderUserId || payload.senderUserId === payload.recipientUserId) return { success: false, error: 'No puedes enviarte una solicitud a ti mismo.' }
  if (payload.evidenceImages.length !== 2) return { success: false, error: 'Debes adjuntar exactamente 2 fotografías como evidencia.' }
  const allowedExtensions = new Set(['jpg', 'jpeg', 'heic', 'heif', 'png', 'dng'])
  if (payload.evidenceImages.some((image) => !allowedExtensions.has(image.path.split('.').pop()?.toLowerCase() || ''))) {
    return { success: false, error: 'Solo se permiten fotografías JPG, JPEG, HEIC, HEIF, PNG o DNG.' }
  }
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: duplicate, error: duplicateError } = await supabase.from('app_notifications').select('id').eq('sender_user_id', payload.senderUserId).eq('report_id', payload.reportId).gte('created_at', since).limit(1)
  if (duplicateError) return { success: false, error: duplicateError.message }
  if (duplicate?.length) return { success: false, error: 'Ya enviaste una solicitud de contacto para este reporte recientemente (espera 1 hora).' }

  const { data, error } = await supabase.from('app_notifications').insert({
    recipient_user_id: payload.recipientUserId, sender_user_id: payload.senderUserId, report_id: payload.reportId,
    type: payload.type, title: payload.title, message: payload.message, sender_name: payload.senderName,
    sender_phone: payload.senderPhone, sender_email: payload.senderEmail, pet_image: payload.petImage,
    evidence_images: payload.evidenceImages,
  }).select().single()
  if (error) return { success: false, error: error.message }
  const audit = await supabase.from('audit_logs').insert({ action: 'CONTACT_REQUEST_SENT', data: data })
  if (audit.error) return { success: false, error: audit.error.message }

  const { error: agentError } = await supabase.functions.invoke('validate-claim-agent', {
    body: {
      notificationId: data.id,
      imageUrls: payload.evidenceImages.map((image) => image.url),
    },
  })
  if (agentError) {
    let errorMessage = agentError.message
    const context = (agentError as { context?: Response }).context
    if (context) {
      try {
        const responseBody = await context.clone().json() as { error?: string }
        if (responseBody.error) errorMessage = responseBody.error
      } catch {
      }
    }

    await supabase.from('app_notifications').delete().eq('id', data.id).eq('sender_user_id', payload.senderUserId)
    return { success: false, error: errorMessage || 'Las evidencias no pudieron validarse.' }
  }
  return { success: true }
}
