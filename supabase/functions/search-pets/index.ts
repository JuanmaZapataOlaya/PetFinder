import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type Language, resolveLanguage } from '../_shared/language.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

const messages = {
  es: {
    methodNotAllowed: 'Método no permitido.',
    notConfigured: 'El servidor no está configurado correctamente.',
    invalidBody: 'El cuerpo de la solicitud no es válido.',
    loadFailed: 'No fue posible cargar los reportes.',
    embeddingFailed: 'Fallo al generar el embedding de búsqueda.',
    invalidEmbedding: 'Portkey no devolvió un embedding válido.',
    searchFailed: 'No fue posible buscar los reportes.',
    timeout: 'La búsqueda tardó demasiado. Intenta de nuevo.',
    unexpected: 'Error interno procesando la búsqueda.',
  },
  en: {
    methodNotAllowed: 'Method not allowed.',
    notConfigured: 'The server is not configured correctly.',
    invalidBody: 'The request body is not valid.',
    loadFailed: 'The reports could not be loaded.',
    embeddingFailed: 'Failed to generate the search embedding.',
    invalidEmbedding: 'Portkey did not return a valid embedding.',
    searchFailed: 'The reports could not be searched.',
    timeout: 'The search took too long. Please try again.',
    unexpected: 'Internal error while processing the search.',
  },
} satisfies Record<Language, Record<string, string>>;

// Stored filter values are Spanish; English (and agent enum) aliases map onto them.
const typeAliases: Record<string, string> = {
  perro: 'Perro', dog: 'Perro',
  gato: 'Gato', cat: 'Gato',
  ave: 'Ave', bird: 'Ave',
  otro: 'Otro', other: 'Otro',
};

const kindAliases: Record<string, string> = {
  perdida: 'Perdida', lost: 'Perdida',
  encontrada: 'Encontrada', found: 'Encontrada',
};

function normalizeFilter(value: unknown, aliases: Record<string, string>): string | null {
  if (typeof value !== 'string') return null;
  return aliases[value.trim().toLowerCase()] ?? null;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  let language = resolveLanguage(undefined, request);
  if (request.method !== 'POST') return jsonResponse({ error: messages[language].methodNotAllowed }, 405);

  const portkeyApiKey = Deno.env.get('PORTKEY_API_KEY');
  const portkeyBaseUrl = Deno.env.get('PORTKEY_BASE_URL');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseSecretKey = Deno.env.get('SECRET_KEY');

  if (!portkeyApiKey || !portkeyBaseUrl || !supabaseUrl || !supabaseSecretKey) {
    return jsonResponse({ error: messages[language].notConfigured }, 500);
  }

  let payload: { query?: unknown; limit?: unknown; type?: unknown; kind?: unknown; language?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: messages[language].invalidBody }, 400);
  }
  language = resolveLanguage(payload.language, request);

  const query = typeof payload.query === 'string' ? payload.query.trim() : '';
  const limit = typeof payload.limit === 'number' && Number.isInteger(payload.limit)
    ? Math.min(Math.max(payload.limit, 1), 100)
    : 50;
  const type = normalizeFilter(payload.type, typeAliases);
  const kind = normalizeFilter(payload.kind, kindAliases);

  if (!query) {
    const supabase = createClient(supabaseUrl, supabaseSecretKey);
    const { data, error } = await supabase.rpc('search_pets', {
      search_query: null,
      query_embedding: null,
      result_limit: limit,
      filter_type: type,
      filter_kind: kind,
    });
    if (error) {
      console.error('[search-pets] Error en RPC sin búsqueda:', error);
      return jsonResponse({ error: messages[language].loadFailed }, 500);
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
      return jsonResponse({ error: messages[language].embeddingFailed }, 502);
    }

    const embedding = embeddingBody.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      return jsonResponse({ error: messages[language].invalidEmbedding }, 502);
    }

    const supabase = createClient(supabaseUrl, supabaseSecretKey);
    const { data, error } = await supabase.rpc('search_pets', {
      search_query: query,
      query_embedding: embedding,
      result_limit: limit,
      filter_type: type,
      filter_kind: kind,
    });

    if (error) {
      console.error('[search-pets] Error en RPC híbrido:', error);
      return jsonResponse({ error: messages[language].searchFailed }, 500);
    }

    const results = data || [];
    const maxHybridScore = Math.max(...results.map((result) => Number(result.hybrid_score) || 0), 0);
    console.info('[search-pets] Resultados de búsqueda', {
      query,
      total: results.length,
      results: results.map((result) => ({
        id: result.id,
        name: result.name,
        keywordRank: result.keyword_rank,
        semanticRank: result.semantic_rank,
        keywordScore: result.keyword_score,
        semanticScore: result.semantic_score,
        hybridScore: result.hybrid_score,
        hybridPercentage: maxHybridScore > 0
          ? Number(((Number(result.hybrid_score) / maxHybridScore) * 100).toFixed(2))
          : 0,
      })),
    });

    return jsonResponse({ results });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return jsonResponse({ error: messages[language].timeout }, 504);
    }
    console.error('[search-pets] Error no controlado:', error);
    return jsonResponse({ error: messages[language].unexpected }, 500);
  } finally {
    clearTimeout(timeoutId);
  }
});
