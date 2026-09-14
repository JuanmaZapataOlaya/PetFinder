import { tool } from 'npm:ai'
import { z } from 'npm:zod'

export const detectAiGeneratedImage = tool({
  description: 'Detecta si una imagen fue generada o editada por inteligencia artificial usando Sightengine y devuelve su respuesta cruda',
  inputSchema: z.object({ imageUrl: z.string().url() }),
  execute: async ({ imageUrl }) => {
    const params = new URLSearchParams({
      url: imageUrl,
      models: 'genai',
      api_user: Deno.env.get('SIGHTENGINE_API_USER') ?? '',
      api_secret: Deno.env.get('SIGHTENGINE_API_SECRET') ?? '',
    })

    const response = await fetch(`https://api.sightengine.com/1.0/check.json?${params.toString()}`, {
      method: 'GET',
    })

    return await response.json()
  },
})