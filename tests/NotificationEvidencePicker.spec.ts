import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NotificationEvidencePicker from '@/components/NotificationEvidencePicker.vue'

function changeFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { configurable: true, value: files })
  input.dispatchEvent(new Event('change'))
}

describe('NotificationEvidencePicker', () => {
  it('rechaza extensiones no permitidas antes de enviar el formulario', async () => {
    const wrapper = mount(NotificationEvidencePicker, { props: { modelValue: [] } })
    const input = wrapper.get('input[type="file"]').element as HTMLInputElement

    changeFiles(input, [
      new File(['contenido'], 'evidencia-1.jpg', { type: 'image/jpeg' }),
      new File(['contenido'], 'evidencia-2.webp', { type: 'image/webp' }),
    ])
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Formato no permitido')
    expect(wrapper.text()).toContain('JPG, JPEG, HEIC, HEIF, PNG o DNG')
    expect(wrapper.emitted('update:modelValue')).toEqual([[[]]])
  })
})
