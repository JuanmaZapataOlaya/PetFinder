import { tool } from 'npm:ai'
import { z } from 'npm:zod'

interface MatchResult {
  imageUrl: string
  source: string | null   // página de origen (exactas) o dominio aproximado (similares)
  pageTitle: string | null
}

export const reverseImageSearch = tool({
  description: 'Busca la imagen en la web usando Google Vision. Devuelve coincidencias exactas con su fuente si existen; si no, las imágenes más parecidas disponibles.',
  inputSchema: z.object({ imageUrl: z.string() }),
  execute: async ({ imageUrl }) => {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${Deno.env.get('GOOGLE_VISION_API_KEY')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { source: { imageUri: imageUrl } },
            features: [{ type: 'WEB_DETECTION', maxResults: 20 }],
          }],
        }),
      }
    )
    const data = await res.json()
    const web = data.responses?.[0]?.webDetection ?? {}

    // --- Paso 1: buscar coincidencias EXACTAS, con su fuente real ---
    const exactMatches: MatchResult[] = []
    for (const page of web.pagesWithMatchingImages ?? []) {
      for (const img of page.fullMatchingImages ?? []) {
        exactMatches.push({
          imageUrl: img.url,
          source: page.url,
          pageTitle: page.pageTitle || null,
        })
        if (exactMatches.length >= 5) break
      }
      if (exactMatches.length >= 5) break
    }

    if (exactMatches.length > 0) {
      return {
        matchType: 'exacta' as const,
        matches: exactMatches,
      }
    }

    // --- Paso 2: sin exactas, tomar las más parecidas (sin score real disponible) ---
    const similarMatches: MatchResult[] = (web.visuallySimilarImages ?? [])
      .slice(0, 4)
      .map((img: { url: string }) => ({
        imageUrl: img.url,
        source: safeHostname(img.url), // aproximación: dominio de la imagen, no la página real
        pageTitle: null,
      }))

    return {
      matchType: similarMatches.length > 0 ? 'similar' as const : 'ninguna' as const,
      matches: similarMatches,
      nota: similarMatches.length > 0
        ? 'Google Vision no expone un score de similitud para estas imágenes; la fuente es el dominio de la imagen, no necesariamente la página donde está publicada.'
        : undefined,
    }
  },
})

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}