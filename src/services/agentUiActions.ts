import type { RouteLocationRaw } from 'vue-router'
import type { PetType, TicketKind } from '@/types'

export type AppSection = 'SUMMARY' | 'EXPLORE' | 'MATCHES' | 'MY_REPORTS' | 'NOTIFICATIONS' | 'PET_HISTORY' | 'PERSONAL_INFO'
export type ScrollDirection = 'UP' | 'DOWN' | 'TOP' | 'BOTTOM'

export const SECTION_ROUTES: Record<AppSection, RouteLocationRaw> = {
  SUMMARY: { name: 'summary' },
  EXPLORE: { name: 'explore' },
  MATCHES: { name: 'explore' },
  MY_REPORTS: { name: 'reports' },
  NOTIFICATIONS: { name: 'Notifications' },
  PET_HISTORY: { name: 'PetHistory' },
  PERSONAL_INFO: { name: 'ContactInfo' },
}

// Ids of elements inside a page that a section should scroll to after navigating.
export const SECTION_ANCHORS: Partial<Record<AppSection, string>> = {
  MATCHES: 'matches',
}

const CLOSE_BUTTON_SELECTOR = [
  '.modal-backdrop .close-button',
  '.report-modal__close',
  '[role="dialog"] [aria-label="Cerrar"]',
].join(', ')

export function isAppSection(value: unknown): value is AppSection {
  return typeof value === 'string' && value in SECTION_ROUTES
}

export function toPetType(kind: unknown): PetType {
  if (kind === 'CAT') return 'Gato'
  if (kind === 'OTHER') return 'Otro'
  return 'Perro'
}

export function toTicketKind(type: unknown): TicketKind | undefined {
  if (type === 'LOST') return 'Perdida'
  if (type === 'FOUND') return 'Encontrada'
  return undefined
}

export function scrollPage(direction: ScrollDirection) {
  const step = Math.round(window.innerHeight * 0.8)
  if (direction === 'TOP') window.scrollTo({ top: 0, behavior: 'smooth' })
  else if (direction === 'BOTTOM') window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
  else window.scrollBy({ top: direction === 'UP' ? -step : step, behavior: 'smooth' })
}

export function scrollToAnchor(anchorId: string) {
  document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Clicks the close button of the top-most visible modal. Returns false when none is open. */
export function closeTopModal(): boolean {
  const visibleButtons = Array.from(document.querySelectorAll<HTMLElement>(CLOSE_BUTTON_SELECTOR))
    .filter((button) => button.offsetParent !== null)
  const closeButton = visibleButtons.at(-1)
  if (!closeButton) return false
  closeButton.click()
  return true
}
