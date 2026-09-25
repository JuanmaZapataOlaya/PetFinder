import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config, Driver, State } from 'driver.js'
import TutorialConfirmationModal from '@/components/TutorialConfirmationModal.vue'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  drive: vi.fn(),
  destroy: vi.fn(),
  driverOptions: undefined as unknown,
  currentPath: '/resumen',
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ get fullPath() { return mocks.currentPath } }),
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('driver.js', () => ({
  driver: vi.fn((options: unknown) => {
    mocks.driverOptions = options
    return { drive: mocks.drive, destroy: mocks.destroy }
  }),
}))

import { useTutorial } from '@/composables/useTutorial'

const TutorialHarness = defineComponent({
  setup() {
    const { isConfirmationVisible, runTutorial, acceptTutorial, closeTutorial } = useTutorial()
    return () => h('div', [
      h('button', { id: 'run', onClick: runTutorial }, 'run'),
      h('button', { id: 'accept', onClick: acceptTutorial }, 'accept'),
      h('button', { id: 'cancel', onClick: closeTutorial }, 'cancel'),
      h('span', { id: 'visibility' }, String(isConfirmationVisible.value)),
    ])
  },
})

describe('tutorial guiado', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    mocks.currentPath = '/resumen'
    mocks.push.mockImplementation(async (location: { name: string } | string) => {
      const name = typeof location === 'string' ? location : location.name
      const target = name === 'summary' ? 'summary' : name === 'Notifications' ? 'notifications' : undefined
      document.body.innerHTML = target ? `<main data-tutorial="${target}"></main>` : ''
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('solicita confirmación, omite destinos ausentes y permite repetir el tutorial', async () => {
    const modal = mount(TutorialConfirmationModal, {
      props: { visible: true },
      attachTo: document.body,
    })
    expect(document.body.textContent).toContain('Bienvenido')
    expect(document.body.textContent).toContain('¿Quieres un recorrido rápido por la aplicación?')
    expect(Array.from(document.body.querySelectorAll('button')).map((button) => button.textContent)).toEqual(['Sí', 'No'])
    modal.unmount()

    const wrapper = mount(TutorialHarness)
    await wrapper.get('#run').trigger('click')
    expect(wrapper.get('#visibility').text()).toBe('true')
    await wrapper.get('#cancel').trigger('click')
    expect(wrapper.get('#visibility').text()).toBe('false')
    expect(mocks.driverOptions).toBeUndefined()

    await wrapper.get('#run').trigger('click')
    await wrapper.get('#accept').trigger('click')
    await flushPromises()

    const options = mocks.driverOptions as Config
    expect(options.steps).toHaveLength(8)
    expect(options.steps?.[0]?.popover?.title).toBe('Resumen')
    expect(options.steps?.[0]?.skipMissingElement).not.toBe(true)
    expect(options.steps?.[1]?.popover?.title).toBe('Busca reportes')
    expect(options.steps?.[1]?.element).toBe('[data-tutorial="explore-search"]')
    expect(options.steps?.[2]?.popover?.title).toBe('Encuentra coincidencias')
    expect(options.steps?.[2]?.element).toBe('[data-tutorial="match-filters"]')
    expect(options.steps?.[7]?.popover?.title).toBe('¿Quieres otro paseo?')
    expect(options.steps?.[7]?.popover?.description).toBe('Si deseas otro paseo por la app aqui puedes solicitarlo')
    expect(options.steps?.[7]?.element).toBe('[data-tutorial="repeat-tutorial"]')
    expect(mocks.drive).toHaveBeenCalledWith(0)

    options.onNextClick?.(undefined, options.steps?.[0] ?? {}, {
      config: options,
      state: { activeIndex: 0 } as State,
      driver: {} as Driver,
      index: 0,
    })
    await flushPromises()
    expect(mocks.push).toHaveBeenCalledWith({ name: 'Notifications' })
    expect(mocks.drive).toHaveBeenLastCalledWith(4)

    options.onDestroyed?.(undefined, options.steps?.[4] ?? {}, {
      config: options,
      state: { activeIndex: 4 } as State,
      driver: {} as Driver,
      index: 4,
    })
    await flushPromises()
    await wrapper.get('#run').trigger('click')
    expect(wrapper.get('#visibility').text()).toBe('true')
    await wrapper.get('#accept').trigger('click')
    await flushPromises()
    expect(mocks.drive).toHaveBeenCalledTimes(3)
    expect(mocks.drive).toHaveBeenLastCalledWith(0)
    wrapper.unmount()
  })
})
