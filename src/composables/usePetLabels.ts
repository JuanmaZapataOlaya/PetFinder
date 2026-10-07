import { useI18n } from 'vue-i18n'

export function usePetLabels() {
  const { t } = useI18n()

  function petType(value: string): string {
    const keys: Record<string, string> = {
      Perro: 'common.dog',
      Gato: 'common.cat',
      Ave: 'common.bird',
      Otro: 'common.other',
    }
    return keys[value] ? t(keys[value]) : value
  }

  function reportKind(value: string): string {
    const keys: Record<string, string> = {
      Perdida: 'common.lost',
      Encontrada: 'common.found',
    }
    return keys[value] ? t(keys[value]) : value
  }

  function reportStatus(value: string): string {
    const keys: Record<string, string> = {
      Activa: 'common.statusActive',
      Resuelta: 'common.statusResolved',
    }
    return keys[value] ? t(keys[value]) : value
  }

  return { petType, reportKind, reportStatus }
}
