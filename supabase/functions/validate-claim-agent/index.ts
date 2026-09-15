import { generateText, ToolLoopAgent, stepCountIs } from 'npm:ai'
import { createOpenAICompatible } from 'npm:@ai-sdk/openai-compatible'
import { analyzeImageMetadata } from './tools/analyze-image-metadata.ts'
import { detectAiGeneratedImage } from './tools/detect-ai-generated-image.ts'
import { reverseImageSearch } from './tools/reverse-image-search.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: jsonHeaders })
}

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SECRET_KEY')!,
)

const portkey = createOpenAICompatible({
  name: 'portkey',
  baseURL: Deno.env.get('PORTKEY_BASE_URL_M')!,
  headers: {
    'x-portkey-api-key': Deno.env.get('PORTKEY_API_KEY_M')!,
    'x-portkey-provider': '@google-gemini', // ej. '@google-gemini'
  },
})

type ClaimTicket = {
  type: string
  breed: string
  color: string
  image: string
}

type RelevanceResult = {
  relevante: boolean
  razon: string
}

type TokenUsage = {
  inputTokens: number
  outputTokens: number
}

const GUARD_INPUT_COST_PER_MILLION = 0.25
const GUARD_OUTPUT_COST_PER_MILLION = 1.5
const AGENT_INPUT_COST_PER_MILLION = 0.3
const AGENT_OUTPUT_COST_PER_MILLION = 2.5

function getTokenUsage(result: { usage?: unknown }): TokenUsage {
  const usage = result.usage && typeof result.usage === 'object'
    ? result.usage as Record<string, unknown>
    : {}
  const inputTokens = Number(usage.inputTokens ?? 0)
  const outputTokens = Number(usage.outputTokens ?? 0)
  return {
    inputTokens: Number.isFinite(inputTokens) && inputTokens >= 0 ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) && outputTokens >= 0 ? outputTokens : 0,
  }
}

function addTokenUsage(first: TokenUsage, second: TokenUsage): TokenUsage {
  return {
    inputTokens: first.inputTokens + second.inputTokens,
    outputTokens: first.outputTokens + second.outputTokens,
  }
}

function calculateCost(usage: TokenUsage, inputRate: number, outputRate: number) {
  return usage.inputTokens * inputRate / 1_000_000 + usage.outputTokens * outputRate / 1_000_000
}

async function isImageRelevantToClaim(imageUrl: string, ticket: ClaimTicket): Promise<{ result: RelevanceResult; usage: TokenUsage }> {
  const result = await generateText({
    model: portkey(Deno.env.get('GEMINI_GATE_MODEL') || 'gemini-3.1-flash-lite'),
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `¿Esta imagen muestra un animal de la especie "${ticket.type}", con pelaje o color similar a "${ticket.color}" y, cuando sea posible, rasgos compatibles con la raza "${ticket.breed}"? Compárala también con esta foto de referencia del reporte original. Responde SOLO con JSON válido: {"relevante": true|false, "razon": "..."}`,
        },
        { type: 'image', image: imageUrl },
        { type: 'image', image: ticket.image },
      ],
    }],
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(result.text)
  } catch {
    throw new Error('El validador de imágenes devolvió una respuesta inválida')
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as Record<string, unknown>).relevante !== 'boolean' ||
    typeof (parsed as Record<string, unknown>).razon !== 'string'
  ) {
    throw new Error('El validador de imágenes devolvió un resultado incompleto')
  }

  return { result: parsed as RelevanceResult, usage: getTokenUsage(result) }
}

async function validateClaimImages(imageUrls: string[], ticket: ClaimTicket): Promise<{ result: RelevanceResult; usage: TokenUsage }> {
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
  for (const imageUrl of imageUrls) {
    const validation = await isImageRelevantToClaim(imageUrl, ticket)
    usage = addTokenUsage(usage, validation.usage)
    if (!validation.result.relevante) return { result: validation.result, usage }
  }
  return {
    result: { relevante: true, razon: 'Las evidencias son coherentes con el reporte original.' },
    usage,
  }
}

async function createCostRecord(notificationId: string, guardUsage: TokenUsage) {
  const { data, error } = await supabaseAdmin
    .from('claim_validation_costs')
    .insert({
      notification_id: notificationId,
      guard_input_tokens: guardUsage.inputTokens,
      guard_output_tokens: guardUsage.outputTokens,
      guard_cost: calculateCost(guardUsage, GUARD_INPUT_COST_PER_MILLION, GUARD_OUTPUT_COST_PER_MILLION),
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

async function completeCostRecord(costId: string, agentUsage: TokenUsage) {
  const { error } = await supabaseAdmin
    .from('claim_validation_costs')
    .update({
      agent_input_tokens: agentUsage.inputTokens,
      agent_output_tokens: agentUsage.outputTokens,
      agent_cost: calculateCost(agentUsage, AGENT_INPUT_COST_PER_MILLION, AGENT_OUTPUT_COST_PER_MILLION),
    })
    .eq('id', costId)
  if (error) throw error
}

const SYSTEM_PROMPT = `
Eres un asistente que ayuda al dueño de una mascota a evaluar si las fotos de soporte
que alguien envió para reclamarla parecen genuinas.

Para CADA imagen que recibas, sigue este orden exacto y detente en el primer hallazgo concluyente
para esa imagen (no sigas gastando herramientas en ella si ya encontraste algo definitivo):

1. Llama a reverseImageSearch con la imagen.
   - Si "matchType" es "exacta": esta imagen fue tomada de otro lugar de internet (otro sitio,
     red social, banco de imágenes, u otro reporte de mascota). Es una señal grave y concluyente.
     NO llames más herramientas para esta imagen — pasa a la siguiente.

2. Si NO hubo coincidencia exacta, llama a detectAiGeneratedImage.
   - Busca en la respuesta el valor relacionado con generación por IA (probablemente bajo
     "type", con una clave como "ai_generated" o similar) — es un número entre 0 y 1.
   - Si ese valor es alto (mayor a 0.7 aproximadamente): concluye que la imagen fue generada
     por inteligencia artificial. Es una señal grave y concluyente. NO llames más herramientas
     para esta imagen.
   - Si ese valor es bajo (menor a 0.3 aproximadamente): la imagen probablemente NO es generada
     por IA. Puedes concluir que parece auténtica sin más pasos, o reforzar con el paso 3 si quieres.
   - Si el valor cae en zona intermedia (ni claramente alto ni claramente bajo): NO es concluyente
     por sí solo, continúa al paso 3.

3. Solo si el paso 2 no fue concluyente, llama también a analyzeImageMetadata para la misma imagen,
   y combina esa información con el resultado (intermedio) de detectAiGeneratedImage para formar
   tu conclusión sobre esa imagen específica. Ten en cuenta que si analyzeImageMetadata devuelve
   "aiSignatureDetected: true", eso por sí solo ya es una prueba fuerte de generación por IA.

Cuando termines de evaluar TODAS las imágenes, escribe UN reporte final dirigido al dueño de la
mascota, quien NO tiene conocimientos técnicos. Reglas estrictas para ese reporte:

- Prohibido usar palabras técnicas: nada de "EXIF", "score", "API", "vector", "JSON", "metadata cruda".
- Usa lenguaje simple y directo: "esta foto parece tomada con un celular real", "esta imagen se
  encontró publicada en otro sitio de internet", "esta imagen fue creada con inteligencia artificial",
  "esta imagen no muestra nada sospechoso".
- Si una o más imágenes resultaron ser generadas por IA o copiadas de internet, dilo de forma clara
  y directa como la PRIMERA idea del reporte — es la conclusión más importante y no debe quedar
  enterrada entre detalles menores.
- Si todas las imágenes parecen genuinas, dilo también con esa misma claridad.
- Cierra siempre recordando que esto es un apoyo para decidir, no una prueba absoluta, y que la
  decisión final de aprobar o rechazar el reclamo es del dueño.
`.trim()

const agent = new ToolLoopAgent({
  model: portkey('gemini-3.5-flash-lite'),
  system: SYSTEM_PROMPT,
  tools: { reverseImageSearch, detectAiGeneratedImage, analyzeImageMetadata },
  stopWhen: stepCountIs(20), // hasta 5 imágenes × hasta 3 tools cada una + margen de razonamiento
})

async function sendClaimNotificationEmail(notification: {
  recipient_user_id: string
  report_id: number
  sender_name: string | null
  pet_tickets: { name: string | null } | null
}) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')
  if (!resendApiKey || !fromEmail) {
    console.warn('[validate-claim-agent] RESEND_API_KEY o RESEND_FROM_EMAIL no configurado; se omite el correo')
    return
  }

  const { data: recipient, error: recipientError } = await supabaseAdmin.auth.admin.getUserById(notification.recipient_user_id)
  const recipientEmail = recipient?.user?.email
  if (recipientError || !recipientEmail) {
    console.error('[validate-claim-agent] No se pudo obtener el correo del propietario:', recipientError)
    return
  }

  const senderName = notification.sender_name || 'Un usuario'
  const petName = notification.pet_tickets?.name || `reporte #${notification.report_id}`
  const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipientEmail],
      subject: `Nueva solicitud para tu mascota: ${petName}`,
      html: `<p>Hola,</p><p><strong>${escapeHtml(senderName)}</strong> envió una solicitud relacionada con el reporte de <strong>${escapeHtml(petName)}</strong>.</p><p>Revisa la solicitud y sus evidencias desde PetFinder. La validación automática de las imágenes se está ejecutando en segundo plano.</p>`,
    }),
  })

  if (!response.ok) console.error('[validate-claim-agent] Error enviando correo:', await response.text())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    if (
      typeof body.notificationId !== 'string' ||
      !Array.isArray(body.imageUrls) ||
      body.imageUrls.length !== 2 ||
      body.imageUrls.some((u: unknown) => typeof u !== 'string')
    ) {
      return jsonResponse({ error: 'notificationId e imageUrls son obligatorios; imageUrls debe tener 2 strings' }, 400)
    }

    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'No autenticado' }, 401)
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authorization.slice(7))
    if (userError || !user) return jsonResponse({ error: 'No autenticado' }, 401)

    const { data: notification, error: notificationError } = await supabaseAdmin
      .from('app_notifications')
      .select('id, sender_user_id, recipient_user_id, report_id, sender_name, type, pet_tickets(name, type, breed, color, image)')
      .eq('id', body.notificationId)
      .single()
    if (notificationError || !notification || notification.sender_user_id !== user.id || notification.type !== 'CONTACT_REQUEST') {
      return jsonResponse({ error: 'La notificación no pertenece al solicitante' }, 403)
    }

    const ticket = notification.pet_tickets
    if (!ticket || !ticket.type || !ticket.breed || !ticket.color || !ticket.image) {
      return jsonResponse({ error: 'No se pudo obtener la información del reporte original' }, 500)
    }

    const relevance = await validateClaimImages(body.imageUrls, ticket)
    const costId = await createCostRecord(notification.id, relevance.usage)
    if (!relevance.result.relevante) {
      return jsonResponse({
        error: `Las imágenes no parecen corresponder con la mascota del reporte. ${relevance.result.razon}`,
        code: 'IRRELEVANT_EVIDENCE',
      }, 422)
    }

    console.log('[validate-claim-agent] Evaluando', body.imageUrls.length, 'imágenes')

    const [_, result] = await Promise.all([
      sendClaimNotificationEmail(notification),
      agent.generate({
        prompt: `Evalúa estas imágenes de soporte para un reclamo de mascota:\n${
          body.imageUrls.map((u: string, i: number) => `${i + 1}. ${u}`).join('\n')
        }`,
      }),
    ])
    await completeCostRecord(costId, getTokenUsage(result))

    console.log('[validate-claim-agent] Pasos:', JSON.stringify(result.steps, null, 2))

    const { error: updateError } = await supabaseAdmin
      .from('app_notifications')
      .update({ agent_report: result.text, agent_steps: result.steps })
      .eq('id', body.notificationId)
    if (updateError) throw updateError

    return jsonResponse({
      success: true,
    })
  } catch (error) {
    console.error('[validate-claim-agent] Error:', error)
    return jsonResponse({ error: String(error) }, 500)
  }
})