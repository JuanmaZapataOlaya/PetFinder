<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const router = useRouter()
const { t } = useI18n()
function confirmEmail() {
  router.push({ path: '/login', query: { verified: '1' } })
}
</script>

<template>
  <main class="auth-page"><section class="auth-panel verify-panel"><div class="auth-brand"><span class="brand-mark">🐾</span><strong>PetFinder</strong></div><div class="verify-icon">✉</div><div class="eyebrow">{{ t('verifyEmail.eyebrow') }}</div><h1>{{ t('verifyEmail.title') }}</h1><p class="auth-intro">{{ t('verifyEmail.instructions') }}</p><button class="primary-button auth-submit" @click="confirmEmail">{{ t('verifyEmail.backToLogin') }}</button><p class="verify-note">{{ t('verifyEmail.activation') }}</p></section></main>
</template>