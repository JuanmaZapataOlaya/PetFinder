import { supabase } from './supabase'

export async function uploadPetImage(file: File, userId: string): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from('pet-images').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from('pet-images').getPublicUrl(path)
  return data.publicUrl
}

const allowedEvidenceTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function validateEvidenceImages(files: File[]): string | null {
  if (files.length !== 2) return 'Debes adjuntar exactamente 2 fotografías como evidencia.'
  if (files.some((file) => !allowedEvidenceTypes.has(file.type))) {
    return 'Solo se permiten fotografías JPG, JPEG, PNG o WEBP.'
  }
  return null
}

export async function uploadNotificationEvidence(files: File[], userId: string) {
  const validationError = validateEvidenceImages(files)
  if (validationError) throw new Error(validationError)

  const uploaded: { url: string; path: string; contentType: 'image/jpeg' | 'image/png' | 'image/webp' }[] = []
  try {
    for (const file of files) {
      const extension = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg'
      const path = `${userId}/notification-evidence/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from('pet-images').upload(path, file, {
        contentType: file.type,
        upsert: false,
      })
      if (error) throw error
      const { data } = supabase.storage.from('pet-images').getPublicUrl(path)
      uploaded.push({ url: data.publicUrl, path, contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' })
    }
    return uploaded
  } catch (error) {
    if (uploaded.length) await supabase.storage.from('pet-images').remove(uploaded.map((image) => image.path))
    throw error
  }
}
