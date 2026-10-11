import { describe, expect, it } from 'vitest'

describe('searchGuardrailService', () => {
  it('acepta una búsqueda válida', async () => {
    const { validateSearchInput } = await import('@/services/searchGuardrailService')
    const result = validateSearchInput('perro golden retriever')
    expect(result.valid).toBe(true)
    expect(result.cleaned).toBeDefined()
  })

  it('acepta búsquedas con acentos y los normaliza', async () => {
    const { validateSearchInput } = await import('@/services/searchGuardrailService')
    const result = validateSearchInput('Perdió su gato')
    expect(result.valid).toBe(true)
  })

  it('rechaza entrada vacía', async () => {
    const { validateSearchInput } = await import('@/services/searchGuardrailService')
    const result = validateSearchInput('')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('2 caracteres')
  })

  it('rechaza entrada de un solo carácter', async () => {
    const { validateSearchInput } = await import('@/services/searchGuardrailService')
    const result = validateSearchInput('a')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('2 caracteres')
  })

  it('rechaza entradas excesivamente largas', async () => {
    const { validateSearchInput } = await import('@/services/searchGuardrailService')
    // Use a varied-char string so it survives repeated-char normalization and hits the length check
    const long = 'labrador retriever golden '.repeat(5)
    const result = validateSearchInput(long)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('100')
  })

  it('rechaza texto con caracteres repetidos seguidos', async () => {
    const { validateSearchInput } = await import('@/services/searchGuardrailService')
    // After repeated-char normalization "aaaaaaaaaa" → "aaa", entropy ≈ 0
    const result = validateSearchInput('aaaaaaaaaa')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('repetitiv')
  })

  it('rechaza texto con palabras no permitidas en español', async () => {
    const { validateSearchInput } = await import('@/services/searchGuardrailService')
    const result = validateSearchInput('mierda de animal')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('palabras no permitidas')
  })

  it('rechaza texto con palabras no permitidas en inglés', async () => {
    const { validateSearchInput } = await import('@/services/searchGuardrailService')
    const result = validateSearchInput('shit dog lost')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('palabras no permitidas')
  })

  it('permite términos de animales que estaban mal bloqueados en español', async () => {
    const { validateSearchInput } = await import('@/services/searchGuardrailService')
    for (const term of ['perro labrador', 'perra golden', 'gato negro', 'cabra blanca', 'gallo perdido']) {
      const result = validateSearchInput(term)
      expect(result.valid, `"${term}" debería ser válido`).toBe(true)
    }
  })

  it('permite nombres y palabras cortas con letras repetidas', async () => {
    const { validateSearchInput } = await import('@/services/searchGuardrailService')
    for (const term of ['Nala', 'Coco', 'Lulu', 'Kiki', 'Ana', 'perro', 'gato', 'pug', 'Toby', 'chihuahua', 'labrador', 'mississippi']) {
      const result = validateSearchInput(term)
      expect(result.valid, `"${term}" debería ser válido`).toBe(true)
    }
  })

  it('rechaza bloques cortos repetidos y textos largos de baja entropía', async () => {
    const { validateSearchInput } = await import('@/services/searchGuardrailService')
    for (const term of ['zz', 'asdasdasd', 'ababab', 'abababababab', 'aaaa bbbb aaaa']) {
      const result = validateSearchInput(term)
      expect(result.valid, `"${term}" debería ser inválido`).toBe(false)
      expect(result.error).toContain('repetitiv')
    }
  })

  it('limpia caracteres especiales antes de validar', async () => {
    const { validateSearchInput } = await import('@/services/searchGuardrailService')
    const result = validateSearchInput('gato!!!   labrador  ###')
    expect(result.valid).toBe(true)
    expect(result.cleaned).toBe('gato labrador')
  })
})
