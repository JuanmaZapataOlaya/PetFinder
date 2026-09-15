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
  const { error } = await supabase.from('app_notifications').update({ finalizado: true }).eq('id', notificationId).eq('recipient_user_id', userId)
  return error ? { success: false, error: error.message } : { success: true }
}

type HistoryNotificationRow = {
  id: string
  report_id: number
  recipient_user_id: string
  created_at: string
  pet_tickets: PetHistoryTicketRow | null
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

export async function getPetHistory(userId: string): Promise<PetHistoryRecord[]> {
  const { data: notificationRows, error: notificationError } = await supabase
    .from('app_notifications')
    .select('id, report_id, recipient_user_id, created_at, pet_tickets(*)')
    .eq('recipient_user_id', userId)
    .eq('finalizado', true)
    .order('created_at', { ascending: false })
  if (notificationError) throw notificationError

  const rows = (notificationRows || []) as unknown as HistoryNotificationRow[]
  const reportIds = [...new Set(rows.map((row) => row.pet_tickets?.id).filter((id): id is number => typeof id === 'number'))]
  const userIds = [...new Set(rows.flatMap((row) => row.pet_tickets ? [row.pet_tickets.owner_id, row.recipient_user_id] : []))]
  if (!reportIds.length || !userIds.length) return []

  const [{ data: ticketRows, error: ticketError }, { data: profileRows, error: profileError }] = await Promise.all([
    supabase.from('pet_tickets').select('*').in('id', reportIds),
    supabase.from('profiles').select('id, name').in('id', userIds),
  ])
  if (ticketError) throw ticketError
  if (profileError) throw profileError

  const ticketsById = new Map((ticketRows || []).map((row) => [Number(row.id), mapHistoryPet(row as PetHistoryTicketRow)]))
  const namesById = new Map((profileRows || []).map((row) => [String(row.id), String(row.name)]))
  return rows.flatMap((row) => {
    const pet = row.pet_tickets ? ticketsById.get(row.pet_tickets.id) : undefined
    if (!pet) return []
    return [{
      id: row.id, reportId: row.report_id, finalizedAt: new Date(row.created_at).getTime(), pet,
      reporterName: namesById.get(pet.ownerId) || 'Usuario reportante',
      finalizerName: namesById.get(row.recipient_user_id) || 'Usuario',
    }]
  })
}

export async function deleteNotification(userId: string, notificationId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('app_notifications').delete().eq('id', notificationId).eq('recipient_user_id', userId)
  return error ? { success: false, error: error.message } : { success: true }
}

export async function sendContactRequest(payload: Omit<AppNotification, 'id' | 'createdAt' | 'read' | 'finalizado'>): Promise<{ success: boolean; error?: string }> {
  if (!payload.senderUserId || payload.senderUserId === payload.recipientUserId) return { success: false, error: 'No puedes enviarte una solicitud a ti mismo.' }
  if (payload.evidenceImages.length !== 2) return { success: false, error: 'Debes adjuntar exactamente 2 fotografías como evidencia.' }
  if (payload.evidenceImages.some((image) => !['image/jpeg', 'image/png', 'image/webp'].includes(image.contentType))) {
    return { success: false, error: 'Solo se permiten fotografías JPG, JPEG, PNG o WEBP.' }
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
  return agentError ? { success: false, error: agentError.message } : { success: true }
}
