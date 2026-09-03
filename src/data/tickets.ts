import { reactive } from 'vue'
import type { PetTicket } from '@/types'
import { supabase } from '@/services/supabase'

export const tickets = reactive<PetTicket[]>([])

export const breedsByType: Record<PetTicket['type'], string[]> = {
  Perro: ['Mestizo', 'Labrador Retriever', 'Golden Retriever', 'Pastor Alemán', 'Border Collie', 'Chihuahua', 'Poodle', 'Bulldog Francés', 'Husky Siberiano', 'Beagle'],
  Gato: ['Europeo común', 'Siamés', 'Persa', 'Maine Coon', 'Bengalí', 'Ragdoll', 'Azul ruso', 'British Shorthair', 'Angora', 'Sphynx'],
  Ave: ['Canario', 'Periquito', 'Cacatúa', 'Agapornis', 'Loro', 'Ninfa', 'Diamante mandarín'],
  Otro: ['Conejo', 'Hámster', 'Cobaya', 'Hurón', 'Tortuga', 'Otro'],
}

type TicketRow = Record<string, unknown> & {
  id: number
  owner_id: string
  name: string
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

function mapTicket(row: TicketRow): PetTicket {
  const reportedAt = new Date(row.reported_at)
  return {
    id: row.id, ownerId: row.owner_id, name: row.name, type: row.type, kind: row.kind, status: row.status,
    location: row.location, latitude: row.latitude, longitude: row.longitude, image: row.image, color: row.color,
    breed: row.breed, note: row.note, match: row.match_score,
    date: reportedAt.toLocaleDateString('es-CO'), timeAgo: reportedAt.toLocaleString('es-CO'),
  }
}

export async function loadTickets() {
  const { data, error } = await supabase.from('pet_tickets').select('*').order('created_at', { ascending: false })
  if (error) throw error
  tickets.splice(0, tickets.length, ...(data as TicketRow[]).map(mapTicket))
}

export async function addTicket(ticket: Omit<PetTicket, 'id' | 'date' | 'timeAgo' | 'status' | 'match'>) {
  const { data, error } = await supabase.from('pet_tickets').insert({
    owner_id: ticket.ownerId, name: ticket.name, type: ticket.type, kind: ticket.kind, location: ticket.location,
    latitude: ticket.latitude, longitude: ticket.longitude, image: ticket.image, color: ticket.color,
    breed: ticket.breed, note: ticket.note,
  }).select().single()
  if (error) throw error
  tickets.unshift(mapTicket(data as TicketRow))
}

export async function updateTicket(id: number, changes: Partial<Omit<PetTicket, 'id' | 'ownerId'>>) {
  const payload: Record<string, unknown> = { ...changes }
  if ('match' in payload) { payload.match_score = payload.match; delete payload.match }
  delete payload.date
  delete payload.timeAgo
  const { data, error } = await supabase.from('pet_tickets').update(payload).eq('id', id).select().single()
  if (error) throw error
  const index = tickets.findIndex((ticket) => ticket.id === id)
  if (index >= 0) tickets[index] = mapTicket(data as TicketRow)
}

export async function removeTicket(id: number) {
  const { error } = await supabase.from('pet_tickets').delete().eq('id', id)
  if (error) throw error
  const index = tickets.findIndex((ticket) => ticket.id === id)
  if (index >= 0) tickets.splice(index, 1)
}
