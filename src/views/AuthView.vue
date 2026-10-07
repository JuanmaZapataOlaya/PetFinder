<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { login, register, startOAuth } from '@/services/authService'
import { countryCallingCodes } from '@/data/countryCallingCodes'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
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
    error.value = reason instanceof Error ? reason.message : t('auth.operationFailed')
  } finally {
    loading.value = false
  }
}

function oauth(provider: 'google' | 'apple') {
  try { startOAuth(provider) } catch (reason) { error.value = reason instanceof Error ? reason.message : t('auth.oauthUnavailable') }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-panel">
      <div class="auth-brand"><span class="brand-mark">🐾</span><strong>PetFinder</strong></div>
      <div class="eyebrow">{{ t('auth.community') }}</div>
      <h1>{{ isRegister ? t('auth.createAccount') : t('auth.welcomeBack') }}</h1>
      <p class="auth-intro">{{ isRegister ? t('auth.signupIntro') : t('auth.loginIntro') }}</p>
      <form class="auth-form" @submit.prevent="submit">
        <div v-if="isRegister" class="form-field">
          <label for="name">{{ t('common.name') }}</label>
          <input id="name" v-model="name" autocomplete="name" :placeholder="t('auth.namePlaceholder')" required />
        </div>
        <div v-if="isRegister" class="form-field">
          <label for="phoneNumber">{{ t('common.phone') }}</label>
          <div class="phone-input">
            <select v-model="phonePrefix" :aria-label="t('auth.phonePrefix')">
              <option v-for="country in countryCallingCodes" :key="`${country.name}-${country.code}`" :value="country.code">{{ country.name }} ({{ country.code }})</option>
            </select>
            <input id="phoneNumber" v-model="phoneNumber" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="3001234567" pattern="[0-9]{7,15}" required />
          </div>
        </div>
        <div class="form-field">
          <label for="email">{{ t('common.email') }}</label>
          <input id="email" v-model="email" type="email" autocomplete="email" placeholder="you@email.com" required />
        </div>
        <div class="form-field">
          <label for="password">{{ t('auth.password') }}</label>
          <input id="password" v-model="password" type="password" :autocomplete="isRegister ? 'new-password' : 'current-password'" :placeholder="t('auth.passwordHint')" minlength="8" required />
        </div>
        <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
        <button class="primary-button auth-submit" :disabled="loading">
          {{ loading ? t('auth.processing') : isRegister ? t('auth.register') : t('auth.login') }}
        </button>
      </form>
      <div class="auth-divider"><span>{{ t('auth.orContinue') }}</span></div>
      <div class="oauth-actions">
        <button class="oauth-button" type="button" @click="oauth('google')"><b>G</b> Google</button>
        <button class="oauth-button" type="button" @click="oauth('apple')"><b>●</b> Apple</button>
      </div>
      <p class="auth-switch">
        {{ isRegister ? t('auth.alreadyAccount') : t('auth.noAccount') }}
        <button type="button" @click="mode = isRegister ? 'login' : 'register'; error = ''">
          {{ isRegister ? t('auth.loginAction') : t('auth.signUpAction') }}
        </button>
      </p>
    </section>
    <aside class="auth-aside">
      <div><span class="eyebrow">PetFinder</span><h2>{{ t('auth.tagline') }}</h2><p>{{ t('auth.communityMessage') }}</p></div>
    </aside>
  </main>
</template>