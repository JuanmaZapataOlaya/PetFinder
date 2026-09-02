export type PetType = 'Perro' | 'Gato' | 'Ave' | 'Otro'
export type TicketStatus = 'Activa' | 'Resuelta'
export type TicketKind = 'Perdida' | 'Encontrada'

export interface PetTicket {
  id: number
  ownerId: string
  name: string
  type: PetType
  kind: TicketKind
  status: TicketStatus
  location: string
  latitude: number
  longitude: number
  date: string
  timeAgo: string
  image: string
  color: string
  breed: string
  note: string
  match: number
}

export interface ContactInfo {
  userId: string;
  fullName?: string;
  age?: number;
  location?: { lat: number; lng: number; address: string }; // Compatible con GoogleMapPicker
  phoneNumber?: string;
  email?: string;
  updatedAt: number;
}

export type NotificationType = 'CONTACT_REQUEST';

export interface AppNotification {
  id: string;
  recipientUserId: string;
  senderUserId: string;
  reportId: number;
  type: NotificationType;
  title: string;
  message: string;
  senderName: string;
  senderPhone: string;
  senderEmail: string;
  petImage?: string;
  createdAt: number;
  read: boolean;
}