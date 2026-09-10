import { tool } from 'npm:ai'
import { z } from 'npm:zod'
import { parse } from 'https://esm.sh/exifr@7.1.3'

const EDITING_TOOLS = ['photoshop', 'gimp', 'snapseed', 'lightroom', 'canva']

export const analyzeImageMetadata = tool({
  description: 'Analiza metadata EXIF/XMP de una imagen de soporte para detectar señales de manipulación, edición o ausencia de datos de cámara real',
  inputSchema: z.object({ imageUrl: z.string() }),
  execute: async ({ imageUrl }) => {
    const res = await fetch(imageUrl)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const exif = await parse(bytes, { xmp: true, iptc: true }).catch(() => null)

    if (!exif) {
      return { hasCamera: false, hasEditingSoftware: false, dateMismatch: false, hasGps: false, score: 25 }
    }

    const software = (exif.Software || '').toLowerCase()
    const hasCamera = Boolean(exif.Make && exif.Model)
    const hasEditingSoftware = EDITING_TOOLS.some((t) => software.includes(t))
    const dateMismatch = exif.DateTimeOriginal && exif.DateTimeDigitized
      ? Math.abs(new Date(exif.DateTimeOriginal).getTime() - new Date(exif.DateTimeDigitized).getTime()) > 60_000
      : false
    const hasGps = Boolean(exif.latitude && exif.longitude)

    let score = 50
    if (hasCamera) score += 25; else score -= 25
    if (hasEditingSoftware) score -= 30
    if (dateMismatch) score -= 10
    if (hasGps) score += 10

    return { hasCamera, hasEditingSoftware, dateMismatch, hasGps, make: exif.Make, model: exif.Model, score: Math.max(0, Math.min(100, score)) }
  },
})