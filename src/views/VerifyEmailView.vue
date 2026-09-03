<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
function confirmEmail() {
  router.push({ path: '/login', query: { verified: '1' } })
}
</script>

<template>
  <main class="auth-page"><section class="auth-panel verify-panel"><div class="auth-brand"><span class="brand-mark">🐾</span><strong>PetFinder</strong></div><div class="verify-icon">✉</div><div class="eyebrow">Un último paso</div><h1>Confirma tu email</h1><p class="auth-intro">Revisa tu correo y abre el enlace de confirmación enviado por Supabase.</p><button class="primary-button auth-submit" @click="confirmEmail">Volver al inicio de sesión</button><p class="verify-note">La cuenta se activará cuando Supabase confirme el enlace.</p></section></main>
</template>