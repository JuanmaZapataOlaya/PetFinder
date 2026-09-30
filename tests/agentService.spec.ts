import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: { functions: { invoke } },
}))

describe('agentService realtime', () => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('solicita una sesión realtime efímera al gateway', async () => {
    const session = {
      session_id: 'session-1',
      model: 'gpt-realtime-2.1-mini',
      ws_url: 'wss://agent.example/realtime/ws?ticket=abc',
      expires_in: 60,
    }
    invoke.mockResolvedValue({ data: session, error: null })

    const { createRealtimeSession } = await import('@/services/agentService')
    await expect(createRealtimeSession('session-1')).resolves.toEqual(session)
    expect(invoke).toHaveBeenCalledWith('agent-gateway', {
      body: { session_id: 'session-1', operation: 'realtime_session' },
    })
  })

  it('rechaza una sesión realtime sin ws_url', async () => {
    invoke.mockResolvedValue({ data: { session_id: 'session-1', model: 'm', expires_in: 60 }, error: null })

    const { createRealtimeSession } = await import('@/services/agentService')
    await expect(createRealtimeSession('session-1')).rejects.toThrow('No fue posible iniciar la sesión de voz.')
  })
})