import { afterEach, vi } from 'vitest'
import { config } from '@vue/test-utils'

config.global.stubs = {
  RouterLink: { template: '<a><slot /></a>' },
  Icon: { template: '<span />' },
  GoogleMapPicker: { template: '<div />' },
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})
