<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login, register, startOAuth } from '@/services/authService'
import { countryCallingCodes } from '@/data/countryCallingCodes'

const route = useRoute()
const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const name = ref('')
const email = ref('')
const password = ref('')
const phonePrefix = ref('+57')
const phoneNumber = ref('')
const error = ref('')
const loading = ref(false)
const isRegister = computed(() => mode.value === 'register')

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (isRegister.value) {
      const user = await register(name.value, email.value, password.value, `${phonePrefix.value}${phoneNumber.value.trim()}`)
      await router.push({ name: 'verify-email', query: { userId: user.id } })
    } else {
      await login(email.value, password.value)
      await router.push(String(route.query.redirect || '/resumen'))
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'No se pudo completar la operación.'
  } finally {
    loading.value = false
  }
}

function oauth(provider: 'google' | 'apple') {
  try { startOAuth(provider) } catch (reason) { error.value = reason instanceof Error ? reason.message : 'OAuth no disponible.' }
}
</script>

<template>
  <main class="auth-page"><section class="auth-panel"><div class="auth-brand"><span class="brand-mark">🐾</span><strong>PetFinder</strong></div><div class="eyebrow">Comunidad que cuida</div><h1>{{ isRegister ? 'Crea tu cuenta' : 'Bienvenido de vuelta' }}</h1><p class="auth-intro">{{ isRegister ? 'Reporta, ayuda y vuelve a encontrarlos.' : 'Entra para continuar gestionando tus reportes.' }}</p><form class="auth-form" @submit.prevent="submit"><div v-if="isRegister" class="form-field"><label for="name">Nombre</label><input id="name" v-model="name" autocomplete="name" placeholder="Andrea Martínez" required /></div><div v-if="isRegister" class="form-field"><label for="phoneNumber">Teléfono</label><div class="phone-input"><select v-model="phonePrefix" aria-label="Prefijo telefónico"><option v-for="country in countryCallingCodes" :key="`${country.name}-${country.code}`" :value="country.code">{{ country.name }} ({{ country.code }})</option></select><input id="phoneNumber" v-model="phoneNumber" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="3001234567" pattern="[0-9]{7,15}" required /></div></div><div class="form-field"><label for="email">Email</label><input id="email" v-model="email" type="email" autocomplete="email" placeholder="tu@email.com" required /></div><div class="form-field"><label for="password">Contraseña</label><input id="password" v-model="password" type="password" :autocomplete="isRegister ? 'new-password' : 'current-password'" placeholder="Mínimo 8 caracteres" minlength="8" required /></div><p v-if="error" class="auth-error" role="alert">{{ error }}</p><button class="primary-button auth-submit" :disabled="loading">{{ loading ? 'Procesando...' : isRegister ? 'Crear cuenta' : 'Iniciar sesión' }}</button></form><div class="auth-divider"><span>o continúa con</span></div><div class="oauth-actions"><button class="oauth-button" type="button" @click="oauth('google')"><b>G</b> Google</button><button class="oauth-button" type="button" @click="oauth('apple')"><b>●</b> Apple</button></div><p class="auth-switch">{{ isRegister ? '¿Ya tienes cuenta?' : '¿Todavía no tienes cuenta?' }} <button type="button" @click="mode = isRegister ? 'login' : 'register'; error = ''">{{ isRegister ? 'Inicia sesión' : 'Regístrate' }}</button></p></section><aside class="auth-aside"><div><span class="eyebrow">PetFinder</span><h2>El camino a casa se construye en comunidad.</h2><p>Cada reporte aumenta las posibilidades de un reencuentro.</p></div></aside></main>
</template>