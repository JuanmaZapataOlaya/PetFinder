import { supabase } from './supabase'

export async function uploadPetImage(file: File, userId: string): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from('pet-images').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from('pet-images').getPublicUrl(path)
  return data.publicUrl
}

const allowedEvidenceExtensions = new Set(['jpg', 'jpeg', 'heic', 'heif', 'png', 'dng'])
const allowedEvidenceFormatsLabel = 'JPG, JPEG, HEIC, HEIF, PNG o DNG'

function getFileExtension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() || ''
}

export function validateEvidenceImages(files: File[]): string | null {
  if (files.length !== 2) return 'Debes adjuntar exactamente 2 fotografías como evidencia.'
  if (files.some((file) => !allowedEvidenceExtensions.has(getFileExtension(file)))) {
    return `Solo se permiten fotografías ${allowedEvidenceFormatsLabel}.`
  }
  return null
}

export async function uploadNotificationEvidence(files: File[], userId: string) {
  const validationError = validateEvidenceImages(files)
  if (validationError) throw new Error(validationError)

  const uploaded: { url: string; path: string; contentType: string }[] = []
  try {
    for (const file of files) {
      const extension = getFileExtension(file)
      const path = `${userId}/notification-evidence/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from('pet-images').upload(path, file, {
        contentType: file.type,
        upsert: false,
      })
      if (error) throw error
      const { data } = supabase.storage.from('pet-images').getPublicUrl(path)
      uploaded.push({ url: data.publicUrl, path, contentType: file.type || 'application/octet-stream' })
    }
    return uploaded
  } catch (error) {
    if (uploaded.length) await supabase.storage.from('pet-images').remove(uploaded.map((image) => image.path))
    throw error
  }
}
