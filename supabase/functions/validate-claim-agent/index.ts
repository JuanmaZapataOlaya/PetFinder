import { generateText, ToolLoopAgent, stepCountIs } from 'npm:ai'
import { createOpenAICompatible } from 'npm:@ai-sdk/openai-compatible'
import { analyzeImageMetadata } from './tools/analyze-image-metadata.ts'
import { detectAiGeneratedImage } from './tools/detect-ai-generated-image.ts'
import { reverseImageSearch } from './tools/reverse-image-search.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { type Language, resolveLanguage } from '../_shared/language.ts'

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

const messages = {
  es: {
    invalidAnimals: 'Las imagenes no corresponden a animales',
    irrelevantEvidence: 'Los animales de las fotos no corresponden con el de la publicación',
    invalidBody: 'notificationId e imageUrls son obligatorios; imageUrls debe tener 2 strings',
    unauthenticated: 'No autenticado',
    forbidden: 'La notificación no pertenece al solicitante',
    ticketUnavailable: 'No se pudo obtener la información del reporte original',
    animalPrompt: '¿Esta imagen muestra un animal? Responde SOLO con JSON válido: {"animal": true|false}',
    matchPrompt: (ticket: ClaimTicket) => `¿Esta imagen muestra un animal de la especie "${ticket.type}", con pelaje o color similar a "${ticket.color}" y, cuando sea posible, rasgos compatibles con la raza "${ticket.breed}"? Compárala también con esta foto de referencia del reporte original. Responde SOLO con JSON válido: {"coincide": true|false}`,
    agentPrompt: (imageList: string) => `Evalúa estas imágenes de soporte para un reclamo de mascota:\n${imageList}`,
    emailFallbackSender: 'Un usuario',
    emailFallbackPet: (reportId: number) => `reporte #${reportId}`,
    emailSubject: (petName: string) => `Nueva solicitud para tu mascota: ${petName}`,
    emailHtml: (senderName: string, petName: string) => `<p>Hola,</p><p><strong>${senderName}</strong> envió una solicitud relacionada con el reporte de <strong>${petName}</strong>.</p><p>Revisa la solicitud y sus evidencias desde PetFinder. La validación automática de las imágenes se está ejecutando en segundo plano.</p>`,
  },
  en: {
    invalidAnimals: 'The images do not show animals',
    irrelevantEvidence: 'The animals in the photos do not match the one in the report',
    invalidBody: 'notificationId and imageUrls are required; imageUrls must contain 2 strings',
    unauthenticated: 'Not authenticated',
    forbidden: 'The notification does not belong to the requester',
    ticketUnavailable: 'The original report information could not be retrieved',
    animalPrompt: 'Does this image show an animal? Respond ONLY with valid JSON: {"animal": true|false}',
    matchPrompt: (ticket: ClaimTicket) => `Does this image show an animal of the species "${ticket.type}", with fur or color similar to "${ticket.color}" and, when possible, features compatible with the breed "${ticket.breed}"? The report values may be written in Spanish. Also compare it with this reference photo from the original report. Respond ONLY with valid JSON: {"coincide": true|false}`,
    agentPrompt: (imageList: string) => `Evaluate these supporting images for a pet claim:\n${imageList}`,
    emailFallbackSender: 'A user',
    emailFallbackPet: (reportId: number) => `report #${reportId}`,
    emailSubject: (petName: string) => `New request for your pet: ${petName}`,
    emailHtml: (senderName: string, petName: string) => `<p>Hello,</p><p><strong>${senderName}</strong> sent a request related to the report for <strong>${petName}</strong>.</p><p>Review the request and its evidence in PetFinder. The automatic image validation is running in the background.</p>`,
  },
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

async function validateImagesAreAnimals(imageUrls: string[], language: Language): Promise<{ success: boolean; usage: TokenUsage; error?: string }> {
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }

  for (const imageUrl of imageUrls) {
    const result = await generateText({
      model: portkey(Deno.env.get('GEMINI_GATE_MODEL') || 'gemini-3.1-flash-lite'),
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: messages[language].animalPrompt,
          },
          { type: 'image', image: imageUrl },
        ],
      }],
    })

    usage = addTokenUsage(usage, getTokenUsage(result))

    let parsed: unknown
    try {
      parsed = JSON.parse(result.text)
    } catch {
      return { success: false, usage, error: messages[language].invalidAnimals }
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as Record<string, unknown>).animal !== 'boolean'
    ) {
      return { success: false, usage, error: messages[language].invalidAnimals }
    }

    if (!(parsed as Record<string, unknown>).animal) {
      return { success: false, usage, error: messages[language].invalidAnimals }
    }
  }

  return { success: true, usage }
}

async function validateAnimalsMatchTicket(imageUrls: string[], ticket: ClaimTicket, language: Language): Promise<{ success: boolean; usage: TokenUsage; error?: string }> {
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }

  for (const imageUrl of imageUrls) {
    const result = await generateText({
      model: portkey(Deno.env.get('GEMINI_GATE_MODEL') || 'gemini-3.1-flash-lite'),
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: messages[language].matchPrompt(ticket),
          },
          { type: 'image', image: imageUrl },
          { type: 'image', image: ticket.image },
        ],
      }],
    })

    usage = addTokenUsage(usage, getTokenUsage(result))

    let parsed: unknown
    try {
      parsed = JSON.parse(result.text)
    } catch {
      return { success: false, usage, error: messages[language].irrelevantEvidence }
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as Record<string, unknown>).coincide !== 'boolean'
    ) {
      return { success: false, usage, error: messages[language].irrelevantEvidence }
    }

    if (!(parsed as Record<string, unknown>).coincide) {
      return { success: false, usage, error: messages[language].irrelevantEvidence }
    }
  }

  return { success: true, usage }
}

async function createCostRecord(notificationId: string) {
  const { data, error } = await supabaseAdmin
    .from('claim_validation_costs')
    .insert({
      notification_id: notificationId,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

async function addGuardrail1Cost(costId: string, guardrail1Usage: TokenUsage) {
  const { error } = await supabaseAdmin
    .from('claim_validation_costs')
    .update({
      guardrail_1_input_tokens: guardrail1Usage.inputTokens,
      guardrail_1_output_tokens: guardrail1Usage.outputTokens,
      guardrail_1_cost: calculateCost(guardrail1Usage, GUARD_INPUT_COST_PER_MILLION, GUARD_OUTPUT_COST_PER_MILLION),
    })
    .eq('id', costId)
  if (error) throw error
}

async function addGuardrail2Cost(costId: string, guardrail2Usage: TokenUsage) {
  const { error } = await supabaseAdmin
    .from('claim_validation_costs')
    .update({
      guardrail_2_input_tokens: guardrail2Usage.inputTokens,
      guardrail_2_output_tokens: guardrail2Usage.outputTokens,
      guardrail_2_cost: calculateCost(guardrail2Usage, GUARD_INPUT_COST_PER_MILLION, GUARD_OUTPUT_COST_PER_MILLION),
    })
    .eq('id', costId)
  if (error) throw error
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

const SYSTEM_PROMPT_ES = `
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
- Escribe todo el reporte en español.
`.trim()

const SYSTEM_PROMPT_EN = `
You are an assistant that helps a pet owner evaluate whether the supporting photos
someone sent to claim their pet look genuine.

For EACH image you receive, follow this exact order and stop at the first conclusive finding
for that image (do not keep spending tools on it once you found something definitive):

1. Call reverseImageSearch with the image.
   - If "matchType" is "exacta" (exact match): this image was taken from somewhere else on the
     internet (another site, social network, stock photo bank, or another pet report). This is a
     serious and conclusive signal. Do NOT call more tools for this image — move to the next one.

2. If there was NO exact match, call detectAiGeneratedImage.
   - Look in the response for the value related to AI generation (probably under "type", with a
     key like "ai_generated" or similar) — it is a number between 0 and 1.
   - If that value is high (above roughly 0.7): conclude that the image was generated by
     artificial intelligence. This is a serious and conclusive signal. Do NOT call more tools
     for this image.
   - If that value is low (below roughly 0.3): the image is probably NOT AI-generated. You can
     conclude it looks authentic without further steps, or reinforce it with step 3 if you want.
   - If the value falls in an intermediate range (neither clearly high nor clearly low): it is NOT
     conclusive on its own, continue to step 3.

3. Only if step 2 was not conclusive, also call analyzeImageMetadata for the same image, and
   combine that information with the (intermediate) result of detectAiGeneratedImage to form your
   conclusion about that specific image. Keep in mind that if analyzeImageMetadata returns
   "aiSignatureDetected: true", that alone is already strong proof of AI generation.

Tool results may contain Spanish values (for example "exacta", "similar", "ninguna", "alta",
"media", "baja"); interpret them, but never copy them into the report.

When you finish evaluating ALL the images, write ONE final report addressed to the pet owner, who
has NO technical knowledge. Strict rules for that report:

- Write the entire report in English.
- Technical words are forbidden: no "EXIF", "score", "API", "vector", "JSON", "raw metadata".
- Use simple and direct language: "this photo looks like it was taken with a real phone", "this
  image was found published on another website", "this image was created with artificial
  intelligence", "this image shows nothing suspicious".
- If one or more images turned out to be AI-generated or copied from the internet, say so clearly
  and directly as the FIRST idea of the report — it is the most important conclusion and must not
  be buried among minor details.
- If all the images look genuine, say that with the same clarity.
- Always close by reminding the owner that this is a decision aid, not absolute proof, and that the
  final decision to approve or reject the claim is theirs.
`.trim()

function createAgent(system: string) {
  return new ToolLoopAgent({
    model: portkey('gemini-3.5-flash-lite'),
    system,
    tools: { reverseImageSearch, detectAiGeneratedImage, analyzeImageMetadata },
    stopWhen: stepCountIs(20), // hasta 5 imágenes × hasta 3 tools cada una + margen de razonamiento
  })
}

const agents: Record<Language, ReturnType<typeof createAgent>> = {
  es: createAgent(SYSTEM_PROMPT_ES),
  en: createAgent(SYSTEM_PROMPT_EN),
}

async function sendClaimNotificationEmail(notification: {
  recipient_user_id: string
  report_id: number
  sender_name: string | null
  pet_tickets: { name: string | null } | null
}, language: Language) {
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

  const senderName = notification.sender_name || messages[language].emailFallbackSender
  const petName = notification.pet_tickets?.name || messages[language].emailFallbackPet(notification.report_id)
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
      subject: messages[language].emailSubject(petName),
      html: messages[language].emailHtml(escapeHtml(senderName), escapeHtml(petName)),
    }),
  })

  if (!response.ok) console.error('[validate-claim-agent] Error enviando correo:', await response.text())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const language = resolveLanguage(body.language, req)
    if (
      typeof body.notificationId !== 'string' ||
      !Array.isArray(body.imageUrls) ||
      body.imageUrls.length !== 2 ||
      body.imageUrls.some((u: unknown) => typeof u !== 'string')
    ) {
      return jsonResponse({ error: messages[language].invalidBody }, 400)
    }

    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: messages[language].unauthenticated }, 401)
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authorization.slice(7))
    if (userError || !user) return jsonResponse({ error: messages[language].unauthenticated }, 401)

    const { data: notification, error: notificationError } = await supabaseAdmin
      .from('app_notifications')
      .select('id, sender_user_id, recipient_user_id, report_id, sender_name, type, pet_tickets(name, type, breed, color, image)')
      .eq('id', body.notificationId)
      .single()
    if (notificationError || !notification || notification.sender_user_id !== user.id || notification.type !== 'CONTACT_REQUEST') {
      return jsonResponse({ error: messages[language].forbidden }, 403)
    }

    const ticket = notification.pet_tickets
    if (!ticket || !ticket.type || !ticket.breed || !ticket.color || !ticket.image) {
      return jsonResponse({ error: messages[language].ticketUnavailable }, 500)
    }

    const costId = await createCostRecord(notification.id)

    const guardrail1 = await validateImagesAreAnimals(body.imageUrls, language)
    await addGuardrail1Cost(costId, guardrail1.usage)
    if (!guardrail1.success) {
      return jsonResponse({ error: guardrail1.error, code: 'INVALID_ANIMALS' }, 422)
    }

    const guardrail2 = await validateAnimalsMatchTicket(body.imageUrls, ticket, language)
    await addGuardrail2Cost(costId, guardrail2.usage)
    if (!guardrail2.success) {
      return jsonResponse({ error: guardrail2.error, code: 'IRRELEVANT_EVIDENCE' }, 422)
    }

    console.log('[validate-claim-agent] Evaluando', body.imageUrls.length, 'imágenes', { language })

    const [_, result] = await Promise.all([
      sendClaimNotificationEmail(notification, language),
      agents[language].generate({
        prompt: messages[language].agentPrompt(
          body.imageUrls.map((u: string, i: number) => `${i + 1}. ${u}`).join('\n'),
        ),
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