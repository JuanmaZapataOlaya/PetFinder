import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import es from '@/locales/es.json'

export type SupportedLocale = 'es' | 'en'
export const LOCALE_STORAGE_KEY = 'petfinder-locale'

const supportedLocales: SupportedLocale[] = ['es', 'en']

function getInitialLocale(): SupportedLocale {
  try {
    const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY)
    return supportedLocales.includes(savedLocale as SupportedLocale)
      ? savedLocale as SupportedLocale
      : 'es'
  } catch (error) {
    console.error('No se pudo leer el idioma guardado.', error)
    return 'es'
  }
}

const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'es',
  messages: { es, en },
})

export function getCurrentLocale(): SupportedLocale {
  const locale = i18n.global.locale.value
  return supportedLocales.includes(locale as SupportedLocale) ? locale as SupportedLocale : 'es'
}

export default i18n
