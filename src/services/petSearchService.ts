// ABOUTME: Executes pet search queries against the vector search backend
// ABOUTME: Validates input through guardrails before invoking the embedding model

import type { PetTicket } from '@/types'
import { supabase } from '@/services/supabase'
import { validateSearchInput } from '@/services/searchGuardrailService'

const turbovecUrl = import.meta.env.VITE_TURBOVEC_URL as string | undefined

type SearchTicketRow = {
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

function mapSearchTicket(row: SearchTicketRow): PetTicket {
  const reportedAt = new Date(row.reported_at)
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name || '',
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
  const validation = validateSearchInput(query)
  if (!validation.valid) throw new Error(validation.error)

  const { data, error } = await supabase.functions.invoke<{ results: SearchTicketRow[] }>('search-pets', {
    body: { query, limit: 50 },
  })
  if (!error) return (data?.results || []).map(mapSearchTicket)

  if (!turbovecUrl) throw error
  const fallbackResponse = await fetch(`${turbovecUrl.replace(/\/+$/, '')}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 50 }),
  })
  if (!fallbackResponse.ok) throw error

  const fallbackBody = await fallbackResponse.json() as { results?: Array<{ record?: SearchTicketRow }> }
  return (fallbackBody.results || [])
    .map((result) => result.record)
    .filter((row): row is SearchTicketRow => Boolean(row))
    .map(mapSearchTicket)
}