import { ToolLoopAgent, stepCountIs } from 'npm:ai'
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
      .select('id, sender_user_id, type')
      .eq('id', body.notificationId)
      .single()
    if (notificationError || !notification || notification.sender_user_id !== user.id || notification.type !== 'CONTACT_REQUEST') {
      return jsonResponse({ error: 'La notificación no pertenece al solicitante' }, 403)
    }

    console.log('[validate-claim-agent] Evaluando', body.imageUrls.length, 'imágenes')

    const result = await agent.generate({
      prompt: `Evalúa estas imágenes de soporte para un reclamo de mascota:\n${
        body.imageUrls.map((u: string, i: number) => `${i + 1}. ${u}`).join('\n')
      }`,
    })

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