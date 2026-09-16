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

export type NotificationType = 'CONTACT_REQUEST' | 'MATCH_SUGGESTED' | 'CLAIM_SUBMITTED' | 'CLAIM_APPROVED' | 'CLAIM_REJECTED';

export interface AppNotification {
  id: string;
  recipientUserId: string;
  senderUserId?: string;
  reportId: number;
  type: NotificationType;
  title: string;
  message: string;
  senderName?: string;
  senderPhone?: string;
  senderEmail?: string;
  petImage?: string;
  evidenceImages: NotificationEvidenceImage[];
  agentReport?: string;
  createdAt: number;
  read: boolean;
  finalizado: boolean;
}

export interface NotificationEvidenceImage {
  url: string;
  path: string;
  contentType: string;
}

export interface PetHistoryRecord {
  id: string;
  reportId: number;
  finalizedAt: number;
  pet: PetTicket;
  reporterName: string;
  recipientName: string;
}