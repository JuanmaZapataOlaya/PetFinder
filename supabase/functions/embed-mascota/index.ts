import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

function jsonResponse(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (request) => {
  const timeoutMs = 25_000;
  let requestTimedOut = false;

  try {
    console.log('[generate-pet-embedding] Paso 1: solicitud recibida', { method: request.method });

    // Manejo de CORS (por si la llamas manualmente desde el frontend)
    if (request.method === 'OPTIONS') {
      console.log('[generate-pet-embedding] Paso 2: respondiendo preflight CORS');
      return new Response('ok', { headers: corsHeaders });
    }
    
    if (request.method !== 'POST') {
      console.log('[generate-pet-embedding] Paso 2: método rechazado');
      return jsonResponse({ error: 'Método no permitido.' }, 405);
    }

    console.log('[generate-pet-embedding] Paso 3: leyendo configuración de entorno');
    const portkeyApiKey = Deno.env.get('PORTKEY_API_KEY');
    const portkeyBaseUrl = Deno.env.get('PORTKEY_BASE_URL');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseSecretKey = Deno.env.get('SECRET_KEY');

    // Validación sin lanzar un Error global que colapse el worker
    if (!portkeyApiKey || !supabaseUrl || !supabaseSecretKey || !portkeyBaseUrl) {
      console.error('[generate-pet-embedding] Configuración incompleta: faltan variables de entorno');
      return jsonResponse({ error: 'El servidor no está configurado correctamente.' }, 500);
    }

    console.log('[generate-pet-embedding] Paso 4: parseando solicitud JSON');
    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      console.error('[generate-pet-embedding] JSON inválido:', error instanceof Error ? error.message : 'Error desconocido');
      return jsonResponse({ error: 'El cuerpo de la solicitud no es válido.' }, 400);
    }

    const { record, type } = payload;

    if (!record || type === 'DELETE') {
      console.log('[generate-pet-embedding] Paso 5: Sin acción requerida (no es INSERT/UPDATE válido)');
      return jsonResponse({ message: 'Sin acción requerida' });
    }

    console.log('[generate-pet-embedding] Paso 6: Preparando texto para el embedding', { petId: record.id });
    const textoAEmbedding = `
      Nombre de la mascota: ${record.name || 'no especificado'}
      Especie: ${record.type || 'no especificada'}
      Raza: ${record.breed || 'no especificada'}
      Color: ${record.color || 'no especificado'}
      Detalles adicionales: ${record.note || 'ninguno'}
    `.trim();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      requestTimedOut = true;
      console.error(`[generate-pet-embedding] Timeout: Portkey no respondió en ${timeoutMs} ms`);
      controller.abort();
    }, timeoutMs);

    try {
      console.log(`[generate-pet-embedding] Paso 7: llamando a Portkey con timeout de ${timeoutMs} ms`);
      const response = await fetch(`${portkeyBaseUrl.replace(/\/+$/, '')}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-portkey-api-key': portkeyApiKey,
        },
        body: JSON.stringify({
          input: textoAEmbedding,
          model: '@azure-openai/text-embedding-3-small',
          encoding_format: 'float',
        }),
        signal: controller.signal,
      });

      console.log('[generate-pet-embedding] Paso 8: respuesta de Portkey recibida', { status: response.status });
      const responseBody = await response.json();

      if (!response.ok) {
        console.error('[generate-pet-embedding] Portkey respondió con error', responseBody);
        return jsonResponse({ error: 'Fallo al generar embedding en Portkey', details: responseBody }, 502);
      }

      const embedding = responseBody.data?.[0]?.embedding;
      if (!Array.isArray(embedding)) {
        console.error('[generate-pet-embedding] La respuesta de Portkey no contiene un array de embeddings válido');
        return jsonResponse({ error: 'Portkey no devolvió un embedding válido.' }, 502);
      }

      console.log('[generate-pet-embedding] Paso 9: Guardando embedding en Supabase');
      const supabase = createClient(supabaseUrl, supabaseSecretKey);
      
      const { error: updateError } = await supabase
        .from('pet_tickets')
        .update({ description_embedding: embedding })
        .eq('id', record.id);

      if (updateError) {
        console.error('[generate-pet-embedding] Error al actualizar base de datos:', updateError);
        return jsonResponse({ error: 'Error guardando en la base de datos' }, 500);
      }

      console.log('[generate-pet-embedding] Paso 10: Proceso completado con éxito');
      return jsonResponse({ success: true, message: `Embedding generado y guardado para mascota ID: ${record.id}` });
      
    } finally {
      clearTimeout(timeoutId);
    }
    
  } catch (error) {
    if (requestTimedOut || (error instanceof DOMException && error.name === 'AbortError')) {
      console.error('[generate-pet-embedding] Error controlado: timeout de Portkey');
      return jsonResponse({ error: 'La generación del embedding tardó demasiado. Intenta de nuevo.' }, 504);
    }

    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[generate-pet-embedding] Error no controlado:', message);
    return jsonResponse({ error: 'Error interno del servidor procesando la petición.' }, 500);
  }
});

