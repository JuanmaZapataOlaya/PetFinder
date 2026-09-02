import { describe, expect, it, vi } from 'vitest'

describe('guards de navegación', () => {
  it('redirige rutas protegidas a login cuando no existe sesión', async () => {
    vi.resetModules()
    const auth = await import('@/services/authService')
    vi.spyOn(auth, 'getCurrentUser').mockReturnValue(null)
    const { default: router } = await import('@/router')
    await router.push('/notifications')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/notifications')
  })

  it('redirige login al resumen si ya existe sesión', async () => {
    vi.resetModules()
    const auth = await import('@/services/authService')
    vi.spyOn(auth, 'getCurrentUser').mockReturnValue({ id: '1', name: 'Ana', email: 'a@b.com', passwordHash: '', verified: true, provider: 'password' })
    const { default: router } = await import('@/router')
    await router.push('/login')
    expect(router.currentRoute.value.name).toBe('summary')
  })
})
