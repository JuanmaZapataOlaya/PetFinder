import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const portkeyApiKey = Deno.env.get('PORTKEY_API_KEY');
  const portkeyBaseUrl = Deno.env.get('PORTKEY_BASE_URL');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseSecretKey = Deno.env.get('SECRET_KEY');

  if (!portkeyApiKey || !portkeyBaseUrl || !supabaseUrl || !supabaseSecretKey) {
    return jsonResponse({ error: 'El servidor no está configurado correctamente.' }, 500);
  }

  let payload: { query?: unknown; limit?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'El cuerpo de la solicitud no es válido.' }, 400);
  }

  const query = typeof payload.query === 'string' ? payload.query.trim() : '';
  const limit = typeof payload.limit === 'number' && Number.isInteger(payload.limit)
    ? Math.min(Math.max(payload.limit, 1), 100)
    : 50;

  if (!query) {
    const supabase = createClient(supabaseUrl, supabaseSecretKey);
    const { data, error } = await supabase.rpc('search_pets', {
      search_query: null,
      query_embedding: null,
      result_limit: limit,
    });
    if (error) {
      console.error('[search-pets] Error en RPC sin búsqueda:', error);
      return jsonResponse({ error: 'No fue posible cargar los reportes.' }, 500);
    }
    return jsonResponse({ results: data || [] });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  try {
    const embeddingResponse = await fetch(`${portkeyBaseUrl.replace(/\/+$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-portkey-api-key': portkeyApiKey,
      },
      body: JSON.stringify({
        input: query,
        model: '@azure-openai/text-embedding-3-small',
        encoding_format: 'float',
      }),
      signal: controller.signal,
    });

    const embeddingBody = await embeddingResponse.json();
    if (!embeddingResponse.ok) {
      console.error('[search-pets] Portkey respondió con error', embeddingBody);
      return jsonResponse({ error: 'Fallo al generar el embedding de búsqueda.' }, 502);
    }

    const embedding = embeddingBody.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      return jsonResponse({ error: 'Portkey no devolvió un embedding válido.' }, 502);
    }

    const supabase = createClient(supabaseUrl, supabaseSecretKey);
    const { data, error } = await supabase.rpc('search_pets', {
      search_query: query,
      query_embedding: embedding,
      result_limit: limit,
    });

    if (error) {
      console.error('[search-pets] Error en RPC híbrido:', error);
      return jsonResponse({ error: 'No fue posible buscar los reportes.' }, 500);
    }

    return jsonResponse({ results: data || [] });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return jsonResponse({ error: 'La búsqueda tardó demasiado. Intenta de nuevo.' }, 504);
    }
    console.error('[search-pets] Error no controlado:', error);
    return jsonResponse({ error: 'Error interno procesando la búsqueda.' }, 500);
  } finally {
    clearTimeout(timeoutId);
  }
});
