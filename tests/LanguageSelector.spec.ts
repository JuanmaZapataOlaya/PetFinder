import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import LanguageSelector from '@/components/LanguageSelector.vue'
import i18n from '@/plugins/i18n'

describe('LanguageSelector', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'es'
  })

  afterEach(() => {
    i18n.global.locale.value = 'es'
  })

  it('cambia y persiste el idioma seleccionado', async () => {
    const wrapper = mount(LanguageSelector)

    await wrapper.get('button[aria-haspopup="listbox"]').trigger('click')
    await wrapper.get('.language-option[role="option"]:last-child').trigger('click')

    expect(i18n.global.locale.value).toBe('en')
    expect(localStorage.getItem('petfinder-locale')).toBe('en')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('cierra el menú al hacer clic fuera', async () => {
    const wrapper = mount(LanguageSelector, { attachTo: document.body })

    await wrapper.get('button[aria-haspopup="listbox"]').trigger('click')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('actualiza las traducciones de la vista sin recargarla', async () => {
    const TestView = defineComponent({
      components: { LanguageSelector },
      setup() {
        const { t } = useI18n()
        return { t }
      },
      template: '<div><span>{{ t("navigation.summary") }}</span><LanguageSelector /></div>',
    })
    const wrapper = mount(TestView)

    await wrapper.get('button[aria-haspopup="listbox"]').trigger('click')
    await wrapper.get('.language-option[role="option"]:last-child').trigger('click')

    expect(wrapper.text()).toContain('Overview')
    wrapper.unmount()
  })
})
