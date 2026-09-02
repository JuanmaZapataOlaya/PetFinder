<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getUserById, verifyEmail } from '@/services/authService'

const route = useRoute()
const router = useRouter()
const userId = String(route.query.userId || '')
const user = computed(() => getUserById(userId))
function confirmEmail() {
  verifyEmail(userId)
  router.push({ path: '/login', query: { verified: '1' } })
}
</script>

<template>
  <main class="auth-page"><section class="auth-panel verify-panel"><div class="auth-brand"><span class="brand-mark">🐾</span><strong>PetFinder</strong></div><div class="verify-icon">✉</div><div class="eyebrow">Un último paso</div><h1>Confirma tu email</h1><p class="auth-intro">Enviamos un enlace de confirmación a <strong>{{ user?.email || 'tu correo' }}</strong>.</p><button class="primary-button auth-submit" @click="confirmEmail">Confirmar email</button><p class="verify-note">Demo local: usa este botón para simular el enlace recibido.</p></section></main>
</template>