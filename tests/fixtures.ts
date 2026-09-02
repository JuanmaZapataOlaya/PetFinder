import type { AuthUser, PetTicket } from '@/types'

export const usuario: AuthUser = {
  id: 'user-1',
  name: 'Ana Martínez',
  email: 'ana@example.com',
  passwordHash: 'hash',
  verified: true,
  provider: 'password',
  photoUrl: 'https://example.com/ana.jpg',
}

export const otroUsuario: AuthUser = {
  ...usuario,
  id: 'user-2',
  name: 'Luis Pérez',
  email: 'luis@example.com',
}

export const ticket: PetTicket = {
  id: 1,
  ownerId: usuario.id,
  name: 'Luna',
  type: 'Perro',
  kind: 'Perdida',
  status: 'Activa',
  location: 'Medellín',
  latitude: 6.2442,
  longitude: -75.5812,
  date: 'Hoy',
  timeAgo: 'Ahora',
  image: 'luna.jpg',
  color: 'Canela',
  breed: 'Mestizo',
  note: 'Collar rojo',
  match: 80,
}
