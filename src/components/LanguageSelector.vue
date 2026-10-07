<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import i18n, { LOCALE_STORAGE_KEY, type SupportedLocale } from '@/plugins/i18n'

const root = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const languages: { code: SupportedLocale; name: string }[] = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
]

function selectLanguage(locale: SupportedLocale) {
  i18n.global.locale.value = locale
  isOpen.value = false

  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch (error) {
    console.error('No se pudo guardar la preferencia de idioma.', error)
  }
}

function handleOutsideClick(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) {
    isOpen.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') isOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsideClick)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsideClick)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="root" class="language-selector">
    <button
      class="language-trigger"
      type="button"
      :aria-label="$t('languageSelector.label')"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      @click="isOpen = !isOpen"
    >
      <svg v-if="i18n.global.locale.value === 'es'" class="language-flag" viewBox="0 0 24 16" aria-hidden="true">
        <rect width="24" height="8" fill="#FCD116" />
        <rect y="8" width="24" height="4" fill="#003893" />
        <rect y="12" width="24" height="4" fill="#CE1126" />
      </svg>
      <svg v-else class="language-flag" viewBox="0 0 24 16" aria-hidden="true">
        <rect width="24" height="16" fill="#fff" />
        <path fill="#B22234" d="M0 0h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24V16H0z" />
        <rect width="10.5" height="8.62" fill="#3C3B6E" />
        <path fill="#fff" d="m1 1 .4 1.1L2.5 2H1.4L1 3.1.6 2H-.5l.9-.7L0 .2zM4 1l.4 1.1L5.5 2H4.4L4 3.1 3.6 2H2.5l.9-.7L3 .2zM7 1l.4 1.1L8.5 2H7.4L7 3.1 6.6 2H5.5l.9-.7L6 .2zM2.5 4l.4 1.1L4 5H2.9l-.4 1.1L2.1 5H1l.9-.7-.4-1.1zM5.5 4l.4 1.1L7 5H5.9l-.4 1.1L5.1 5H4l.9-.7-.4-1.1zM8.5 4l.4 1.1L10 5H8.9l-.4 1.1L8.1 5H7l.9-.7-.4-1.1zM1 7l.4 1.1L2.5 8H1.4L1 9.1.6 8H-.5l.9-.7L0 6.2zM4 7l.4 1.1L5.5 8H4.4L4 9.1 3.6 8H2.5l.9-.7L3 6.2zM7 7l.4 1.1L8.5 8H7.4L7 9.1 6.6 8H5.5l.9-.7L6 6.2z" />
      </svg>
      <span class="visually-hidden">{{ $t('languageSelector.label') }}</span>
    </button>

    <div v-if="isOpen" class="language-menu" role="listbox" :aria-label="$t('languageSelector.label')">
      <button
        v-for="language in languages"
        :key="language.code"
        class="language-option"
        type="button"
        role="option"
        :aria-selected="i18n.global.locale.value === language.code"
        @click="selectLanguage(language.code)"
      >
        <svg v-if="language.code === 'es'" class="language-flag" viewBox="0 0 24 16" aria-hidden="true">
          <rect width="24" height="8" fill="#FCD116" />
          <rect y="8" width="24" height="4" fill="#003893" />
          <rect y="12" width="24" height="4" fill="#CE1126" />
        </svg>
        <svg v-else class="language-flag" viewBox="0 0 24 16" aria-hidden="true">
          <rect width="24" height="16" fill="#fff" />
          <path fill="#B22234" d="M0 0h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24v1.23H0zm0 2.46h24V16H0z" />
          <rect width="10.5" height="8.62" fill="#3C3B6E" />
          <path fill="#fff" d="m1 1 .4 1.1L2.5 2H1.4L1 3.1.6 2H-.5l.9-.7L0 .2zM4 1l.4 1.1L5.5 2H4.4L4 3.1 3.6 2H2.5l.9-.7L3 .2zM7 1l.4 1.1L8.5 2H7.4L7 3.1 6.6 2H5.5l.9-.7L6 .2zM2.5 4l.4 1.1L4 5H2.9l-.4 1.1L2.1 5H1l.9-.7-.4-1.1zM5.5 4l.4 1.1L7 5H5.9l-.4 1.1L5.1 5H4l.9-.7-.4-1.1zM8.5 4l.4 1.1L10 5H8.9l-.4 1.1L8.1 5H7l.9-.7-.4-1.1zM1 7l.4 1.1L2.5 8H1.4L1 9.1.6 8H-.5l.9-.7L0 6.2zM4 7l.4 1.1L5.5 8H4.4L4 9.1 3.6 8H2.5l.9-.7L3 6.2zM7 7l.4 1.1L8.5 8H7.4L7 9.1 6.6 8H5.5l.9-.7L6 6.2z" />
        </svg>
        <span>{{ language.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.language-selector {
  position: relative;
}

.language-trigger {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid #e2e8e0;
  border-radius: 8px;
  background: white;
}

.language-trigger:focus-visible,
.language-option:focus-visible {
  outline: 2px solid #75a259;
  outline-offset: 2px;
}

.language-flag {
  display: block;
  width: 24px;
  height: 16px;
  overflow: hidden;
  border-radius: 2px;
  box-shadow: 0 0 0 1px #17211c1a;
}

.language-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
  min-width: 150px;
  padding: 5px;
  border: 1px solid #e2e8e0;
  border-radius: 9px;
  background: white;
  box-shadow: 0 8px 24px #173c3220;
}

.language-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 6px;
  padding: 9px;
  background: transparent;
  color: #314238;
  text-align: left;
  font-size: 13px;
}

.language-option:hover,
.language-option[aria-selected='true'] {
  background: #f1f5ef;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  clip-path: inset(50%);
}
</style>
