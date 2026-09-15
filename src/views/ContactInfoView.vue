<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getCurrentUser } from '@/services/authService'
import GoogleMapPicker from '@/components/GoogleMapPicker.vue'
import type { ContactInfo } from '@/types'
import { getContactInfo, saveContactInfo as persistContactInfo } from '@/services/contactService'
import { countryCallingCodes } from '@/data/countryCallingCodes'

const currentUser = getCurrentUser()
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
  } catch { feedbackMessage.value = 'No se pudo cargar la información de contacto.' }
})

function updateLocation(location: { latitude: number; longitude: number }) {
  form.value.latitude = location.latitude
  form.value.longitude = location.longitude
}

async function saveContactInfo() {
  if (!currentUser) {
    feedbackMessage.value = 'Debes iniciar sesión para guardar tu información.'
    return
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (form.value.email && !emailRegex.test(form.value.email)) {
    feedbackMessage.value = 'El formato del correo electrónico es inválido.'
    return
  }
  if (!/^\d{7,15}$/.test(form.value.phoneNumber || '')) {
    feedbackMessage.value = 'Ingresa un número de teléfono válido de 7 a 15 dígitos.'
    return
  }

  loading.value = true
  try {
    await persistContactInfo({ ...form.value, phoneNumber: `${phonePrefix.value}${form.value.phoneNumber}`, userId: currentUser.id })
    feedbackMessage.value = 'Información actualizada exitosamente.'
  } catch { feedbackMessage.value = 'No se pudo guardar la información de contacto.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="page-view">
    <div class="eyebrow">Mi Perfil</div>
    <h1>Información de Contacto</h1>
    <p class="page-intro">Configura la información que compartirás para contactar a otros usuarios o cuando visualicen tus reportes.</p>
    
    <form class="auth-form" @submit.prevent="saveContactInfo" style="max-width: 600px; margin-top: 2rem;">
      <div class="form-field">
        <label for="fullName">Nombre Completo (Opcional)</label>
        <input id="fullName" v-model="form.fullName" type="text" placeholder="Ej. Juan Pérez" />
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-field">
          <label for="age">Edad (Opcional)</label>
          <input id="age" v-model="form.age" type="number" />
        </div>
        <div class="form-field">
          <label for="phoneNumber">Teléfono</label>
          <div class="phone-input">
            <select v-model="phonePrefix" aria-label="Prefijo telefónico">
              <option v-for="country in countryCallingCodes" :key="`${country.name}-${country.code}`" :value="country.code">{{ country.name }} ({{ country.code }})</option>
            </select>
            <input id="phoneNumber" v-model="form.phoneNumber" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="3001234567" pattern="[0-9]{7,15}" required />
          </div>
        </div>
      </div>

      <div class="form-field">
        <label for="email">Correo Electrónico (Opcional)</label>
        <input id="email" v-model="form.email" type="email" />
      </div>

      <div class="form-field">
        <label>Ubicación General (Opcional)</label>
        <div style="border: 1px solid #ccc; border-radius: 8px; overflow: hidden;">
          <GoogleMapPicker
            :latitude="form.latitude"
            :longitude="form.longitude"
            :interactive="true"
            height="250px"
            @location-change="updateLocation"
          />
        </div>
      </div>

      <p v-if="feedbackMessage" style="color: #16a34a; margin-bottom: 1rem; font-weight: 500;">{{ feedbackMessage }}</p>

      <button type="submit" class="primary-button" :disabled="loading">
        {{ loading ? 'Guardando...' : 'Guardar Información' }}
      </button>
    </form>
  </section>
</template>