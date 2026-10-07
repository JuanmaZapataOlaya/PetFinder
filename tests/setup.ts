import { afterEach, vi } from 'vitest'
import { config } from '@vue/test-utils'
import i18n from '@/plugins/i18n'

config.global.stubs = {
  RouterLink: { template: '<a><slot /></a>' },
  Icon: { template: '<span />' },
  GoogleMapPicker: { template: '<div />' },
}
config.global.plugins = [i18n]

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
  vi.restoreAllMocks()
})
