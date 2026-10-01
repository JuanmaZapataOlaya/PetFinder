import { describe, expect, it, vi } from 'vitest'

vi.mock('@/services/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { results: [] }, error: null }),
    },
  },
}))

describe('petSearchService guardrails', () => {
  it('rechaza búsqueda con caracteres repetitivos sin llamar al modelo', async () => {
    const { supabase } = await import('@/services/supabase')
    const { searchPets } = await import('@/services/petSearchService')
    await expect(searchPets('aaaaaaaaaa')).rejects.toThrow('repetitiv')
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('rechaza búsqueda vacía sin llamar al modelo', async () => {
    const { supabase } = await import('@/services/supabase')
    const { searchPets } = await import('@/services/petSearchService')
    await expect(searchPets('')).rejects.toThrow()
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('rechaza búsqueda con palabras no permitidas sin llamar al modelo', async () => {
    const { supabase } = await import('@/services/supabase')
    const { searchPets } = await import('@/services/petSearchService')
    await expect(searchPets('shit dog lost')).rejects.toThrow('no permitidas')
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('permite búsquedas válidas y llama al modelo', async () => {
    const { supabase } = await import('@/services/supabase')
    const invokeMock = vi.mocked(supabase.functions.invoke)
    invokeMock.mockClear()
    const { searchPets } = await import('@/services/petSearchService')
    await searchPets('perro golden retriever')
    expect(invokeMock).toHaveBeenCalledOnce()
  })

  it('envía los filtros de tipo y clase al endpoint', async () => {
    const { supabase } = await import('@/services/supabase')
    const invokeMock = vi.mocked(supabase.functions.invoke)
    invokeMock.mockClear()
    const { searchPets } = await import('@/services/petSearchService')

    await searchPets('perro', { type: 'Perro', kind: 'Perdida' })

    expect(invokeMock).toHaveBeenCalledWith('search-pets', {
      body: {
        query: 'perro',
        limit: 50,
        type: 'Perro',
        kind: 'Perdida',
      },
    })
  })
})
