import { tool } from 'npm:ai'
import { z } from 'npm:zod'
import { parse } from 'https://esm.sh/exifr@7.1.3'

const EDITING_TOOLS = ['photoshop', 'gimp', 'snapseed', 'lightroom', 'canva', 'picsart']

// Marcadores que delatan generación por IA cuando aparecen en texto plano
// (PNG tEXt "parameters", EXIF UserComment, o el propio tag Software)
const AI_TEXT_MARKERS = [
  /\bsteps:\s*\d+/i,
  /\bcfg scale:\s*[\d.]+/i,
  /\bsampler:\s*\w+/i,
  /\bmodel hash:\s*\w+/i,
  /\bseed:\s*\d+/i,
  /negative prompt:/i,
  /stable diffusion/i,
  /midjourney/i,
  /automatic1111/i,
  /comfyui/i,
  /invokeai/i,
  /adobe firefly/i,
  /dall-?e/i,
  /leonardo\.ai/i,
  /nightcafe/i,
]

// Resoluciones exactas típicas de pantallas de celular (screenshots).
// No exhaustiva: es una señal de apoyo, no la única fuente de verdad.
const COMMON_SCREEN_RESOLUTIONS = new Set([
  '1170x2532', '1179x2556', '1080x1920', '1080x2400', '828x1792',
  '750x1334', '1242x2688', '1125x2436', '1440x3200', '1080x2340',
  '1284x2778', '1206x2622',
])

/**
 * Parser manual de chunks PNG tipo tEXt (texto plano, sin comprimir).
 * exifr no expone estos chunks de forma directa, así que los leemos a mano.
 * Limitación conocida: no cubre iTXt/zTXt (comprimidos) — suficiente para
 * detectar Automatic1111, que usa tEXt sin comprimir por defecto.
 */
function extractPngTextChunks(bytes: Uint8Array): Record<string, string> {
  const result: Record<string, string> = {}
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (!isPng) return result

  let offset = 8 // después de la firma PNG
  const decoder = new TextDecoder('latin1')

  while (offset + 8 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0)
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8))

    if (type === 'tEXt') {
      const chunkData = bytes.slice(offset + 8, offset + 8 + length)
      const text = decoder.decode(chunkData)
      const nullIndex = text.indexOf('\x00')
      if (nullIndex !== -1) {
        const keyword = text.slice(0, nullIndex)
        const value = text.slice(nullIndex + 1)
        result[keyword] = value
      }
    }

    if (type === 'IEND') break
    offset += 12 + length // largo + tipo + data + CRC
  }

  return result
}

function detectAiTextSignature(text: string): boolean {
  return AI_TEXT_MARKERS.some((pattern) => pattern.test(text))
}

export const analyzeImageMetadata = tool({
  description: 'Analiza metadata EXIF/XMP/PNG de una imagen de soporte para detectar señales de manipulación, edición, o generación por inteligencia artificial',
  inputSchema: z.object({ imageUrl: z.string() }),
  execute: async ({ imageUrl }) => {
    const res = await fetch(imageUrl)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const exif = await parse(bytes, { xmp: true, iptc: true }).catch(() => null)

    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    const pngTextChunks = isPng ? extractPngTextChunks(bytes) : {}
    const pngTextBlob = Object.values(pngTextChunks).join(' ')

    const software = (exif?.Software || '').toLowerCase()
    const userComment = (exif?.UserComment || '').toString()

    // --- Señal fuerte: firma explícita de generación por IA ---
    const combinedText = [pngTextBlob, userComment, software].join(' ')
    const aiSignatureDetected = detectAiTextSignature(combinedText)
    const aiToolDetected = aiSignatureDetected
      ? (AI_TEXT_MARKERS.find((p) => p.test(combinedText))?.source ?? 'desconocido')
      : null

    if (aiSignatureDetected) {
      // Evidencia casi irrefutable — no tiene sentido promediar con otras señales
      return {
        aiSignatureDetected: true,
        aiToolDetected,
        hasCamera: false,
        hasEditingSoftware: false,
        dateMismatch: false,
        hasGps: false,
        isPng,
        matchesScreenResolution: false,
        score: 0,
        confidence: 'alta',
      }
    }

    if (!exif) {
      return {
        aiSignatureDetected: false,
        aiToolDetected: null,
        hasCamera: false,
        hasEditingSoftware: false,
        dateMismatch: false,
        hasGps: false,
        isPng,
        matchesScreenResolution: false,
        score: 40, // sin EXIF es ambiguo (screenshot, reenvío, o IA limpia) — no tan bajo como antes
        confidence: 'baja',
      }
    }

    const hasCamera = Boolean(exif.Make && exif.Model)
    const hasEditingSoftware = EDITING_TOOLS.some((t) => software.includes(t))
    const dateMismatch = exif.DateTimeOriginal && exif.DateTimeDigitized
      ? Math.abs(new Date(exif.DateTimeOriginal).getTime() - new Date(exif.DateTimeDigitized).getTime()) > 60_000
      : false
    const hasGps = Boolean(exif.latitude && exif.longitude)

    const width = exif.ImageWidth ?? exif.ExifImageWidth
    const height = exif.ImageHeight ?? exif.ExifImageHeight
    const matchesScreenResolution = width && height
      ? COMMON_SCREEN_RESOLUTIONS.has(`${width}x${height}`)
      : false

    let score = 50
    if (hasCamera) score += 20; else score -= 10          // antes: +25/-25 — ausencia es más ambigua de lo que pensábamos
    if (hasEditingSoftware) score -= 30                     // se mantiene: evidencia directa
    if (dateMismatch) score -= 10                            // se mantiene
    if (hasGps) score += 5                                   // antes +10 — es raro incluso en fotos genuinas, no debe pesar tanto
    if (isPng) score -= 5                                     // nueva señal débil
    if (matchesScreenResolution) score -= 20                  // nueva señal moderada de screenshot

    return {
      aiSignatureDetected: false,
      aiToolDetected: null,
      hasCamera,
      hasEditingSoftware,
      dateMismatch,
      hasGps,
      isPng,
      matchesScreenResolution,
      make: exif.Make,
      model: exif.Model,
      score: Math.max(0, Math.min(100, score)),
      confidence: 'media',
    }
  },
})