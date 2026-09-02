import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ticket, usuario } from './fixtures'

describe('gestión CRUD de reportes', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.setItem('petfinder.tickets', JSON.stringify([ticket]))
  })

  it('crea reportes con valores derivados y los persiste', async () => {
    const { addTicket, tickets } = await import('@/data/tickets')
    addTicket({ ...ticket, id: undefined as never, status: undefined as never, date: undefined as never, timeAgo: undefined as never, match: undefined as never })
    expect(tickets[0].ownerId).toBe(usuario.id)
    expect(tickets[0].status).toBe('Activa')
    expect(JSON.parse(localStorage.getItem('petfinder.tickets') || '[]')).toHaveLength(2)
  })

  it('actualiza un reporte existente e ignora ids inexistentes', async () => {
    const { updateTicket, tickets } = await import('@/data/tickets')
    updateTicket(ticket.id, { name: 'Nube', status: 'Resuelta' })
    updateTicket(999, { name: 'No existe' })
    expect(tickets[0]).toMatchObject({ name: 'Nube', status: 'Resuelta' })
  })

  it('elimina reportes existentes sin alterar el estado ante ids desconocidos', async () => {
    const { removeTicket, tickets } = await import('@/data/tickets')
    removeTicket(999)
    expect(tickets).toHaveLength(1)
    removeTicket(ticket.id)
    expect(tickets).toHaveLength(0)
  })
})
