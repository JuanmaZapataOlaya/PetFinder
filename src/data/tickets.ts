import type { PetTicket } from '@/types'
import { reactive } from 'vue'

const seedTickets: PetTicket[] = [
]

const storedTickets = localStorage.getItem('petfinder.tickets')
export const tickets = reactive<PetTicket[]>(storedTickets ? JSON.parse(storedTickets) as PetTicket[] : seedTickets)

export const breedsByType: Record<PetTicket['type'], string[]> = {
  Perro: ['Mestizo', 'Labrador Retriever', 'Golden Retriever', 'Pastor Alemán', 'Border Collie', 'Chihuahua', 'Poodle', 'Bulldog Francés', 'Husky Siberiano', 'Beagle'],
  Gato: ['Europeo común', 'Siamés', 'Persa', 'Maine Coon', 'Bengalí', 'Ragdoll', 'Azul ruso', 'British Shorthair', 'Angora', 'Sphynx'],
  Ave: ['Canario', 'Periquito', 'Cacatúa', 'Agapornis', 'Loro', 'Ninfa', 'Diamante mandarín'],
  Otro: ['Conejo', 'Hámster', 'Cobaya', 'Hurón', 'Tortuga', 'Otro'],
}

export function addTicket(ticket: Omit<PetTicket, 'id' | 'date' | 'timeAgo' | 'status' | 'match'>) {
  const newTicket: PetTicket = { ...ticket, id: Date.now(), date: 'Ahora', timeAgo: 'Ahora', status: 'Activa', match: 0 }
  tickets.unshift(newTicket)
  localStorage.setItem('petfinder.tickets', JSON.stringify(tickets))
}

export function updateTicket(id: number, changes: Partial<Omit<PetTicket, 'id' | 'ownerId'>>) {
  const index = tickets.findIndex((ticket) => ticket.id === id)
  const currentTicket = tickets[index]
  if (!currentTicket) return
  tickets[index] = { ...currentTicket, ...changes }
  localStorage.setItem('petfinder.tickets', JSON.stringify(tickets))
}

export function removeTicket(id: number) {
  const index = tickets.findIndex((ticket) => ticket.id === id)
  if (index === -1) return
  tickets.splice(index, 1)
  localStorage.setItem('petfinder.tickets', JSON.stringify(tickets))
}