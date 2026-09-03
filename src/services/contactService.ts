import type { ContactInfo } from '@/types'
import { supabase } from './supabase'

export async function getContactInfo(userId: string): Promise<ContactInfo | null> {
  const { data, error } = await supabase.from('contact_infos').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    userId: data.user_id, fullName: data.full_name, age: data.age, phoneNumber: data.phone_number, email: data.email,
    location: data.latitude === null || data.longitude === null ? undefined : { lat: data.latitude, lng: data.longitude, address: data.address || '' },
    updatedAt: new Date(data.updated_at).getTime(),
  }
}

export async function saveContactInfo(info: Omit<ContactInfo, 'updatedAt'> & { latitude?: number; longitude?: number }) {
  const { error } = await supabase.from('contact_infos').upsert({
    user_id: info.userId, full_name: info.fullName || null, age: info.age || null, phone_number: info.phoneNumber || null,
    email: info.email || null, latitude: info.latitude ?? info.location?.lat ?? null, longitude: info.longitude ?? info.location?.lng ?? null,
    address: info.location?.address || null, updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
