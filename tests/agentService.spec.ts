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
      client_secret: { value: 'secret', expires_at: 123 },
      tools: [],
    }
    invoke.mockResolvedValue({ data: session, error: null })

    const { createRealtimeSession } = await import('@/services/agentService')
    await expect(createRealtimeSession('session-1')).resolves.toEqual(session)
    expect(invoke).toHaveBeenCalledWith('agent-gateway', {
      body: { session_id: 'session-1', operation: 'realtime_session' },
    })
  })
})