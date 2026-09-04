const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

function jsonResponse(body: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

Deno.serve(async (request) => {
  const timeoutMs = 25_000
  let requestTimedOut = false

  try {
    console.log('[generate-pet-description] Paso 1: solicitud recibida', { method: request.method })

    if (request.method === 'OPTIONS') {
      console.log('[generate-pet-description] Paso 2: respondiendo preflight CORS')
      return new Response('ok', { headers: corsHeaders })
    }
    if (request.method !== 'POST') {
      console.log('[generate-pet-description] Paso 2: método rechazado')
      return jsonResponse({ error: 'Método no permitido.' }, 405)
    }

    console.log('[generate-pet-description] Paso 2: leyendo configuración')
    const portkeyApiKey = Deno.env.get('PORTKEY_API_KEY_M')
    if (!portkeyApiKey) {
      console.error('[generate-pet-description] Configuración incompleta: falta PORTKEY_API_KEY')
      return jsonResponse({ error: 'La función no está configurada.' }, 500)
    }

    console.log('[generate-pet-description] Paso 3: parseando solicitud')
    let body: { image?: unknown; type?: unknown; name?: unknown; breed?: unknown; color?: unknown; kind?: unknown }
    try {
      body = await request.json()
    } catch (error) {
      console.error('[generate-pet-description] JSON inválido:', error instanceof Error ? error.message : 'Error desconocido')
      return jsonResponse({ error: 'El cuerpo de la solicitud no es válido.' }, 400)
    }
    const isImageReference = typeof body.image === 'string' && (body.image.startsWith('data:image/') || body.image.startsWith('https://'))
    if (!isImageReference) {
      console.log('[generate-pet-description] Paso 4: imagen rechazada')
      return jsonResponse({ error: 'Se requiere una imagen válida.' }, 400)
    }

    console.log('[generate-pet-description] Paso 4: validación completada')
    const context = [
      `Especie: ${typeof body.type === 'string' ? body.type : 'no especificada'}`,
      `Nombre: ${typeof body.name === 'string' ? body.name : 'no especificado'}`,
      `Raza: ${typeof body.breed === 'string' ? body.breed : 'no especificada'}`,
      `Color: ${typeof body.color === 'string' ? body.color : 'no especificado'}`,
      `Tipo de reporte: ${typeof body.kind === 'string' ? body.kind : 'no especificado'}`,
    ].join('\n')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      requestTimedOut = true
      console.error(`[generate-pet-description] Timeout: Portkey no respondió en ${timeoutMs} ms`)
      controller.abort()
    }, timeoutMs)

    try {
      console.log(`[generate-pet-description] Paso 5: llamando a Portkey con timeout de ${timeoutMs} ms`)
      const upstream = await fetch('https://api.portkey.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-portkey-api-key': portkeyApiKey,
          'x-portkey-provider': '@google-gemini',
        },
        body: JSON.stringify({
          model: 'gemini-3.5-flash-lite',
          temperature: 0.2,
          max_tokens: 180,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: `Describe la mascota de la imagen en español para un reporte de búsqueda. Sé objetivo, breve (máximo 3 frases) y menciona solo rasgos visibles: especie, tamaño aproximado, pelaje, colores, patrones, collar y características distintivas. No inventes datos. Usa estos datos proporcionados solo como contexto:\n${context}` },
              { type: 'image_url', image_url: { url: body.image } },
            ],
          }],
        }),
        signal: controller.signal,
      })

      console.log('[generate-pet-description] Paso 6: respuesta recibida', { status: upstream.status })
      if (!upstream.ok) {
        const errorText = await upstream.text()
        console.error('[generate-pet-description] Portkey respondió con error', { status: upstream.status, body: errorText })
        return jsonResponse({ error: 'El proveedor de IA no pudo generar la descripción.' }, 502)
      }

      console.log('[generate-pet-description] Paso 7: parseando respuesta del proveedor')
      const result = await upstream.json()
      const content = result.choices?.[0]?.message?.content
      const description = typeof content === 'string'
        ? content
        : Array.isArray(content) ? content.filter((part: { type?: string }) => part.type === 'text').map((part: { text?: string }) => part.text || '').join(' ') : ''

      if (!description.trim()) {
        console.error('[generate-pet-description] La respuesta no contiene una descripción')
        return jsonResponse({ error: 'La IA no devolvió una descripción.' }, 502)
      }

      console.log('[generate-pet-description] Paso 8: descripción generada correctamente')
      return jsonResponse({ description: description.trim() })
    } finally {
      clearTimeout(timeoutId)
      console.log('[generate-pet-description] Paso 9: timeout limpiado')
    }
  } catch (error) {
    if (requestTimedOut || (error instanceof DOMException && error.name === 'AbortError')) {
      console.error('[generate-pet-description] Error controlado: timeout de Portkey/Google')
      return jsonResponse({ error: 'La generación tardó demasiado. Intenta de nuevo.' }, 504)
    }

    const message = error instanceof Error ? error.message : 'Error desconocido'
    console.error('[generate-pet-description] Error no controlado:', message)
    return jsonResponse({ error: 'No se pudo generar la descripción.' }, 500)
  }
})