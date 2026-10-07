<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getCurrentUser } from '@/services/authService'
import GoogleMapPicker from '@/components/GoogleMapPicker.vue'
import type { ContactInfo } from '@/types'
import { getContactInfo, saveContactInfo as persistContactInfo } from '@/services/contactService'
import { countryCallingCodes } from '@/data/countryCallingCodes'

const currentUser = getCurrentUser()
const { t } = useI18n()
type ContactForm = Omit<Partial<ContactInfo>, 'location'> & {
  latitude: number
  longitude: number
}

const form = ref<ContactForm>({
  userId: currentUser?.id,
  fullName: '',
  age: undefined,
  phoneNumber: '',
  email: '',
  latitude: 6.2442,
  longitude: -75.5812
})

const feedbackMessage = ref('')
const loading = ref(false)
const phonePrefix = ref('+57')

function loadPhoneNumber(phone: string | undefined) {
  if (!phone) return
  const matchingCountry = [...countryCallingCodes]
    .sort((first, second) => second.code.length - first.code.length)
    .find((country) => phone.startsWith(country.code))
  if (matchingCountry) {
    phonePrefix.value = matchingCountry.code
    form.value.phoneNumber = phone.slice(matchingCountry.code.length).replace(/\D/g, '')
    return
  }
  form.value.phoneNumber = phone.replace(/\D/g, '')
}

onMounted(async () => {
  if (!currentUser?.id) return
  try {
    const contact = await getContactInfo(currentUser.id)
    if (contact) {
      form.value = { ...form.value, ...contact, latitude: contact.location?.lat || form.value.latitude, longitude: contact.location?.lng || form.value.longitude }
      loadPhoneNumber(contact.phoneNumber)
    } else {
      loadPhoneNumber(currentUser.phoneNumber)
    }
  } catch { feedbackMessage.value = t('contactInfo.loadingError') }
})

function updateLocation(location: { latitude: number; longitude: number }) {
  form.value.latitude = location.latitude
  form.value.longitude = location.longitude
}

async function saveContactInfo() {
  if (!currentUser) {
    feedbackMessage.value = t('contactInfo.loginRequired')
    return
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (form.value.email && !emailRegex.test(form.value.email)) {
    feedbackMessage.value = t('contactInfo.invalidEmail')
    return
  }
  if (!/^\d{7,15}$/.test(form.value.phoneNumber || '')) {
    feedbackMessage.value = t('contactInfo.invalidPhone')
    return
  }

  loading.value = true
  try {
    await persistContactInfo({ ...form.value, phoneNumber: `${phonePrefix.value}${form.value.phoneNumber}`, userId: currentUser.id })
    feedbackMessage.value = t('contactInfo.saved')
  } catch { feedbackMessage.value = t('contactInfo.saveError')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="page-view" data-tutorial="personal-info">
    <div class="eyebrow">{{ t('contactInfo.profile') }}</div>
    <h1>{{ t('contactInfo.title') }}</h1>
    <p class="page-intro">{{ t('contactInfo.intro') }}</p>
    
    <form class="auth-form" @submit.prevent="saveContactInfo" style="max-width: 600px; margin-top: 2rem;">
      <div class="form-field">
        <label for="fullName">{{ t('contactInfo.fullName') }}</label>
        <input id="fullName" v-model="form.fullName" type="text" :placeholder="t('contactInfo.namePlaceholder')" />
      </div>
      
      <div class="age-phone-grid">
        <div class="form-field">
          <label for="age">{{ t('contactInfo.age') }}</label>
          <input id="age" v-model="form.age" type="number" />
        </div>
        <div class="form-field">
          <label for="phoneNumber">{{ t('common.phone') }}</label>
          <div class="phone-input">
            <select v-model="phonePrefix" :aria-label="t('contactInfo.phonePrefix')">
              <option v-for="country in countryCallingCodes" :key="`${country.name}-${country.code}`" :value="country.code">{{ country.name }} ({{ country.code }})</option>
            </select>
            <input id="phoneNumber" v-model="form.phoneNumber" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="3001234567" pattern="[0-9]{7,15}" required />
          </div>
        </div>
      </div>

      <div class="form-field">
        <label for="email">{{ t('contactInfo.email') }}</label>
        <input id="email" v-model="form.email" type="email" />
      </div>

      <div class="form-field">
        <label>{{ t('contactInfo.generalLocation') }}</label>
        <div class="map-wrap">
          <GoogleMapPicker
            :latitude="form.latitude"
            :longitude="form.longitude"
            :interactive="true"
            height="250px"
            @location-change="updateLocation"
          />
        </div>
      </div>

      <p v-if="feedbackMessage" class="feedback-message">{{ feedbackMessage }}</p>

      <button type="submit" class="primary-button" :disabled="loading">
        {{ loading ? t('contactInfo.saving') : t('contactInfo.save') }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.age-phone-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.map-wrap {
  border: 1px solid #ccc;
  border-radius: 8px;
  overflow: hidden;
}

.feedback-message {
  color: #16a34a;
  margin-bottom: 1rem;
  font-weight: 500;
}

@media (max-width: 650px) {
  .age-phone-grid {
    grid-template-columns: 1fr;
  }
}
</style>