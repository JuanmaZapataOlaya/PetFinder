import { supabase } from '@/services/supabase'

export type AgentAction = 'FIND_PET' | 'REPORT_PET' | 'RUN_TUTORIAL'

export interface AgentResponse {
  message: string
  action: AgentAction | null
  payload: Record<string, unknown>
  session_id: string
  correlation_id: string
}

export interface RealtimeSession {
  session_id: string
  model: string
  ws_url: string
  expires_in: number
}

export interface AgentActionResult {
  type: AgentAction
  params: Record<string, unknown>
}

export async function startAgentSession(userId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ session_id: string }>('agent-gateway', {
    body: { user_id: userId, operation: 'start_session' },
  })
  if (error) throw error
  if (!data?.session_id) throw new Error('No fue posible iniciar la sesión del asistente.')
  return data.session_id
}

export async function sendAgentMessage(sessionId: string, message: string): Promise<AgentResponse> {
  const { data, error } = await supabase.functions.invoke<AgentResponse>('agent-gateway', {
    body: { session_id: sessionId, message },
  })
  if (error) throw error
  if (!data?.message) throw new Error('El asistente no devolvió una respuesta válida.')
  return data
}

export async function createRealtimeSession(sessionId: string): Promise<RealtimeSession> {
  const { data, error } = await supabase.functions.invoke<RealtimeSession>('agent-gateway', {
    body: { session_id: sessionId, operation: 'realtime_session' },
  })
  if (error) throw error
  if (!data?.session_id || !data.ws_url) throw new Error('No fue posible iniciar la sesión de voz.')
  return data
}

export function executeAgentAction(response: Pick<AgentResponse, 'action' | 'payload'>): AgentActionResult | null {
  if (!response.action) return null
  return { type: response.action, params: response.payload }
}
