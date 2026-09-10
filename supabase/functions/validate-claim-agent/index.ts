import { analyzeImageMetadata } from './tools/analyze-image-metadata.ts'
import { reverseImageSearch } from './tools/reverse-image-search.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: jsonHeaders })
}

// Flag temporal: deja el análisis de metadata desactivado mientras se prueba
// el pipeline con la nueva tool de búsqueda inversa por separado.
const ENABLE_METADATA_ANALYSIS = false

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { imageUrl } = await req.json()
    if (!imageUrl) {
      return jsonResponse({ error: 'Falta imageUrl' }, 400)
    }

    console.log('[validate-claim-agent] Paso 1: búsqueda inversa de imagen')
    const reverseSearchResult = await reverseImageSearch.execute(
      { imageUrl },
      { toolCallId: 'reverse-image-search', messages: [] }
    )

    let metadataResult: unknown = { skipped: true, reason: 'ENABLE_METADATA_ANALYSIS está en false' }

    if (ENABLE_METADATA_ANALYSIS) {
      console.log('[validate-claim-agent] Paso 2: análisis de metadata EXIF')
      metadataResult = await analyzeImageMetadata.execute(
        { imageUrl },
        { toolCallId: 'analyze-image-metadata', messages: [] }
      )
    } else {
      console.log('[validate-claim-agent] Paso 2: omitido (ENABLE_METADATA_ANALYSIS = false)')
    }

    return jsonResponse({
      imageUrl,
      reverseSearch: reverseSearchResult,
      metadata: metadataResult,
    })
  } catch (error) {
    console.error('[validate-claim-agent] Error:', error)
    return jsonResponse({ error: String(error) }, 500)
  }
})