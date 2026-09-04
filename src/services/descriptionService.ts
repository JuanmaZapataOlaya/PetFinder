import { supabase } from './supabase'

export interface PetDescriptionContext {
  image: string
  type: string
  name?: string
  breed?: string
  color?: string
  kind?: string
}

export async function generatePetDescription(context: PetDescriptionContext): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-pet-description', { body: context })
  if (error) throw error
  if (!data || typeof data.description !== 'string' || !data.description.trim()) {
    throw new Error('La función no devolvió una descripción válida.')
  }
  return data.description.trim()
}