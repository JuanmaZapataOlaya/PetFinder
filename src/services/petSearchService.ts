import type { PetTicket } from '@/types'
import { supabase } from '@/services/supabase'

type SearchTicketRow = {
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

function mapSearchTicket(row: SearchTicketRow): PetTicket {
  const reportedAt = new Date(row.reported_at)
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    type: row.type,
    kind: row.kind,
    status: row.status,
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    image: row.image,
    color: row.color,
    breed: row.breed,
    note: row.note,
    match: row.match_score,
    date: reportedAt.toLocaleDateString('es-CO'),
    timeAgo: reportedAt.toLocaleString('es-CO'),
  }
}

export async function searchPets(query: string): Promise<PetTicket[]> {
  const { data, error } = await supabase.functions.invoke<{ results: SearchTicketRow[] }>('search-pets', {
    body: { query, limit: 50 },
  })
  if (error) throw error
  return (data?.results || []).map(mapSearchTicket)
}
