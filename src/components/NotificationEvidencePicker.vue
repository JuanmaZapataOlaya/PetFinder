<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ 'update:modelValue': [files: File[]] }>()
const previews = ref<string[]>([])
const error = ref('')
const allowedExtensions = new Set(['jpg', 'jpeg', 'heic', 'heif', 'png', 'dng'])
const { t } = useI18n()
const allowedFormatsLabel = 'JPG, JPEG, HEIC, HEIF, PNG, DNG'

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
    error.value = t('evidence.exactlyTwo')
    emit('update:modelValue', [])
    input.value = ''
    return
  }
  if (files.some((file) => !allowedExtensions.has(file.name.split('.').pop()?.toLowerCase() || ''))) {
    error.value = t('evidence.formatError', { formats: allowedFormatsLabel })
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
    <label for="notification-evidence">{{ t('evidence.label') }}</label>
    <input id="notification-evidence" type="file" accept=".jpg,.jpeg,.heic,.heif,.png,.dng" multiple @change="onFilesSelected" />
    <small>{{ t('evidence.hint', { formats: allowedFormatsLabel }) }}</small>
    <p v-if="error" class="evidence-error" role="alert">{{ error }}</p>
    <div v-if="previews.length" class="evidence-previews" :aria-label="t('evidence.preview')">
      <img v-for="(preview, index) in previews" :key="preview" :src="preview" :alt="t('common.evidenceAlt', { index: index + 1 })" />
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
