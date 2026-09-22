// ABOUTME: Validates search input before model consumption
// ABOUTME: Implements entropy checks, character cleaning, and profanity filtering

import { Profanity } from '@2toad/profanity';

const profanity = new Profanity({
  languages: ['es'],
});

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

  // Check Shannon entropy (too low = likely gibberish/spam)
  const entropy = calculateShannonEntropy(cleaned)
  if (entropy < 2) {
    return { valid: false, error: 'La búsqueda parece inválida (caracteres repetitivos).' }
  }

  // Check for profanity
  if (profanity.exists(cleaned)) {
    return { valid: false, error: 'La búsqueda contiene palabras no permitidas.' }
  }

  return { valid: true, cleaned }
}
