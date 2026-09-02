import { beforeEach, describe, expect, it, vi } from 'vitest'
import { otroUsuario, usuario } from './fixtures'

describe('authService', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.setItem('petfinder.users', JSON.stringify([usuario]))
  })

  it('registra usuarios normalizando datos y almacenando la contraseña hasheada', async () => {
    const { register } = await import('@/services/authService')
    const resultado = await register('  Luis Pérez ', ' LUIS@EXAMPLE.COM ', 'secreto')
    expect(resultado.name).toBe('Luis Pérez')
    expect(resultado.email).toBe('luis@example.com')
    expect(resultado.passwordHash).not.toBe('secreto')
    expect(JSON.parse(localStorage.getItem('petfinder.users') || '[]')).toHaveLength(2)
  })

  it('rechaza correos duplicados', async () => {
    const { register } = await import('@/services/authService')
    await expect(register(usuario.name, usuario.email, 'secreto')).rejects.toThrow('Ya existe')
  })

  it('inicia sesión solo con credenciales y cuenta verificada', async () => {
    const { register, login, getCurrentUser } = await import('@/services/authService')
    await register('Nueva', 'nueva@example.com', 'secreto')
    const pendiente = JSON.parse(localStorage.getItem('petfinder.users') || '[]')[1]
    await expect(login('nueva@example.com', 'secreto')).rejects.toThrow('Confirma')
    const users = JSON.parse(localStorage.getItem('petfinder.users') || '[]')
    users[1] = { ...pendiente, verified: true }
    localStorage.setItem('petfinder.users', JSON.stringify(users))
    await login('NUEVA@example.com', 'secreto')
    expect(getCurrentUser()?.email).toBe('nueva@example.com')
  })

  it('rechaza credenciales inválidas y emite cambios de sesión', async () => {
    const { login, logout, AUTH_STATE_CHANGED_EVENT } = await import('@/services/authService')
    const listener = vi.fn()
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, listener)
    await expect(login('wrong@example.com', 'bad')).rejects.toThrow('incorrectos')
    localStorage.setItem('petfinder.session', usuario.id)
    logout()
    expect(localStorage.getItem('petfinder.session')).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('verifica usuarios y permite buscarlos por id', async () => {
    localStorage.setItem('petfinder.users', JSON.stringify([otroUsuario]))
    const { getUserById, verifyEmail } = await import('@/services/authService')
    verifyEmail(otroUsuario.id)
    expect(getUserById(otroUsuario.id)?.verified).toBe(true)
    expect(getUserById('missing')).toBeNull()
  })
})
