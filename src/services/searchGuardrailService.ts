// ABOUTME: Validates search input before model consumption
// ABOUTME: Implements entropy checks, character cleaning, and profanity filtering

import { Profanity } from '@2toad/profanity';

const profanity = new Profanity({ languages: ['es', 'en'] })

// Remove animal/color terms that appear in the Spanish profanity list but are
// legitimate search terms in a pet-finder context.
profanity.removeWords([
  'perro', 'perra', 'perras',
  'negro', 'negros',
  'cabra', 'gallos', 'colibrí',
  'bigotes', 'hueso',
])

function calculateShannonEntropy(text: string): number {
  if (!text.length) return 0

  const frequencies: Record<string, number> = {}
  for (const char of text.toLowerCase()) {
    frequencies[char] = (frequencies[char] || 0) + 1
  }

  let entropy = 0
  for (const count of Object.values(frequencies)) {
    const probability = count / text.length
    entropy -= probability * Math.log2(probability)
  }

  return entropy
}

const MIN_LENGTH_FOR_ENTROPY_CHECK = 8
const MIN_ENTROPY = 1.5

function isRepetitive(text: string): boolean {
  const compact = text.toLowerCase().replace(/\s+/g, '')

  // Un único carácter repetido: "aaa", "zzzz"
  if (new Set(compact).size === 1) return true

  // Un mismo bloque corto repetido 3+ veces: "asdasdasd", "ababab"
  if (/^(.{1,3})\1{2,}$/.test(compact)) return true

  return compact.length >= MIN_LENGTH_FOR_ENTROPY_CHECK && calculateShannonEntropy(compact) < MIN_ENTROPY
}

function removeDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function cleanSearchInput(input: string): string {
  let cleaned = input.trim()

  // Remove diacritics
  cleaned = removeDiacritics(cleaned)

  // Remove special characters, keep only letters, numbers, and spaces
  cleaned = cleaned.replace(/[^a-zA-Z0-9\s]/g, '')

  // Replace consecutive repeated characters (more than 3) with max 3
  cleaned = cleaned.replace(/(.)\1{3,}/g, '$1$1$1')

  // Remove extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  return cleaned
}

export function validateSearchInput(input: string): { valid: boolean; error?: string; cleaned?: string } {
  const cleaned = cleanSearchInput(input)

  // Validate length
  if (cleaned.length < 2) {
    return { valid: false, error: 'La búsqueda debe tener al menos 2 caracteres.' }
  }

  if (cleaned.length > 100) {
    return { valid: false, error: 'La búsqueda no puede exceder 100 caracteres.' }
  }

  // Check repetitive input (single char, repeated short block, or low entropy on long text)
  if (isRepetitive(cleaned)) {
    return { valid: false, error: 'La búsqueda parece inválida (caracteres repetitivos).' }
  }

  // Check for profanity
  if (profanity.exists(cleaned)) {
    return { valid: false, error: 'La búsqueda contiene palabras no permitidas.' }
  }

  return { valid: true, cleaned }
}
