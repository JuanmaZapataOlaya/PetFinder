<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const emit = defineEmits<{ 'update:modelValue': [files: File[]] }>()
const previews = ref<string[]>([])
const error = ref('')

function clearPreviews() {
  previews.value.forEach((preview) => URL.revokeObjectURL(preview))
  previews.value = []
}

function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  clearPreviews()
  error.value = ''

  if (files.length !== 2) {
    error.value = 'Debes seleccionar exactamente 2 fotografías.'
    emit('update:modelValue', [])
    input.value = ''
    return
  }
  if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
    error.value = 'Formato no permitido. Usa JPG, JPEG, PNG o WEBP.'
    emit('update:modelValue', [])
    input.value = ''
    return
  }

  previews.value = files.map((file) => URL.createObjectURL(file))
  emit('update:modelValue', files)
}

onBeforeUnmount(clearPreviews)
</script>

<template>
  <div class="evidence-picker">
    <label for="notification-evidence">Fotografías de evidencia (obligatorias)</label>
    <input id="notification-evidence" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple @change="onFilesSelected" />
    <small>Selecciona exactamente 2 imágenes en JPG, JPEG, PNG o WEBP.</small>
    <p v-if="error" class="evidence-error" role="alert">{{ error }}</p>
    <div v-if="previews.length" class="evidence-previews" aria-label="Vista previa de evidencias">
      <img v-for="(preview, index) in previews" :key="preview" :src="preview" :alt="`Evidencia ${index + 1}`" />
    </div>
  </div>
</template>

<style scoped>
.evidence-picker { display: flex; flex-direction: column; gap: .35rem; }
.evidence-picker label { font-size: .85rem; font-weight: bold; }
.evidence-picker small { color: #718077; font-size: .75rem; }
.evidence-picker input { font: inherit; font-size: .8rem; }
.evidence-error { margin: 0; color: #b5533e; font-size: .8rem; }
.evidence-previews { display: grid; grid-template-columns: repeat(2, 1fr); gap: .5rem; margin-top: .35rem; }
.evidence-previews img { width: 100%; height: 110px; border-radius: 6px; object-fit: cover; }
</style>
