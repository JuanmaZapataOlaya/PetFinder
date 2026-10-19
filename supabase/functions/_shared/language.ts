export type Language = 'es' | 'en'

export const DEFAULT_LANGUAGE: Language = 'es'

/**
 * Resuelve el idioma de la respuesta: primero el campo `language` del body,
 * luego el header Accept-Language y, si nada coincide, español.
 */
export function resolveLanguage(value: unknown, request?: Request): Language {
  if (value === 'es' || value === 'en') return value

  const acceptLanguage = request?.headers.get('Accept-Language')?.toLowerCase() ?? ''
  const preferred = acceptLanguage.split(',')[0]?.trim() ?? ''
  if (preferred.startsWith('en')) return 'en'
  return DEFAULT_LANGUAGE
}
