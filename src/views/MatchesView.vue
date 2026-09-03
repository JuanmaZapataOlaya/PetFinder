<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import GoogleMapPicker from '@/components/GoogleMapPicker.vue'
import { tickets } from '@/data/tickets'
import { getCurrentUser } from '@/services/authService'
import { sendContactRequest } from '@/services/notificationService'
import { getContactInfo } from '@/services/contactService'
import type { ContactInfo, PetTicket, PetType, TicketKind } from '@/types'

const RADIUS_OPTIONS = [
  { label: 'Cualquier distancia', value: 0 },
  { label: '500 m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '3 km', value: 3000 },
  { label: '5 km', value: 5000 },
]

const filterKind = ref<'Todos' | TicketKind>('Todos')
const filterType = ref<'Todas' | PetType>('Todas')
const filterRadius = ref(0)
const refLat = ref(19.4326)
const refLng = ref(-99.1332)
const selectedTicket = ref<PetTicket | null>(null)
const ownerContactInfo = ref<{ fullName?: string; phoneNumber?: string; email?: string } | null>(null)
const showContactForm = ref(false)
const contactMessage = ref('')
const feedback = ref({ text: '', isError: false })

const currentUser = computed(() => getCurrentUser())

watch(selectedTicket, async (newTicket) => {
  showContactForm.value = false
  contactMessage.value = ''
  feedback.value = { text: '', isError: false }

  if (newTicket) {
    const contact = await getContactInfo(newTicket.ownerId)
    ownerContactInfo.value = contact ? { fullName: contact.fullName, phoneNumber: contact.phoneNumber, email: contact.email } : null
  } else {
    ownerContactInfo.value = null
  }
})

const firstOwnTicket = tickets.find((ticket) => ticket.ownerId === getCurrentUser()?.id)
if (firstOwnTicket) {
  refLat.value = firstOwnTicket.latitude
  refLng.value = firstOwnTicket.longitude
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

const matchedReports = computed(() => {
  const userId = currentUser.value?.id
  return tickets.filter((ticket) => {
    if (ticket.ownerId === userId) return false
    if (filterKind.value !== 'Todos' && ticket.kind !== filterKind.value) return false
    if (filterType.value !== 'Todas' && ticket.type !== filterType.value) return false
    if (filterRadius.value > 0) {
      const dist = haversineMeters(refLat.value, refLng.value, ticket.latitude, ticket.longitude)
      if (dist > filterRadius.value) return false
    }
    return true
  })
})

const reportsWithDistance = computed(() =>
  matchedReports.value.map((t) => ({
    ticket: t,
    distanceM: filterRadius.value > 0
      ? Math.round(haversineMeters(refLat.value, refLng.value, t.latitude, t.longitude))
      : null,
  }))
)

const mapMarkers = computed(() =>
  matchedReports.value.map((t) => ({
    latitude: t.latitude,
    longitude: t.longitude,
    image: t.image,
    name: t.name,
  }))
)

const otherReportsForMap = computed(() =>
  matchedReports.value
    .filter((ticket) => ticket.id !== selectedTicket.value?.id)
    .map((ticket) => ({
      latitude: ticket.latitude,
      longitude: ticket.longitude,
      image: ticket.image,
      name: ticket.name,
    }))
)

function onReferenceMove(loc: { latitude: number; longitude: number }) {
  refLat.value = loc.latitude
  refLng.value = loc.longitude
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`
  return `${(meters / 1000).toFixed(1)} km`
}

async function submitContact() {
  if (!selectedTicket.value || !currentUser.value) {
    feedback.value = { text: 'Debes iniciar sesión para contactar al propietario.', isError: true }
    return
  }

  const myContactInfo: Pick<ContactInfo, 'fullName' | 'phoneNumber' | 'email'> = await getContactInfo(currentUser.value.id) || {}
  const result = await sendContactRequest({
    recipientUserId: selectedTicket.value.ownerId,
    senderUserId: currentUser.value.id,
    reportId: selectedTicket.value.id,
    petImage: selectedTicket.value.image,
    type: 'CONTACT_REQUEST',
    title: 'Nueva solicitud de contacto',
    message: contactMessage.value,
    senderName: myContactInfo.fullName || currentUser.value.name || 'Usuario',
    senderPhone: myContactInfo.phoneNumber || 'No especificado',
    senderEmail: myContactInfo.email || 'No especificado',
  })

  if (result.success) {
    feedback.value = { text: 'Tu información de contacto fue enviada correctamente al propietario.', isError: false }
    showContactForm.value = false
  } else {
    feedback.value = { text: result.error || 'Ocurrió un error.', isError: true }
  }
}
</script>

<template>
  <section class="page-view">
    <div class="eyebrow">Motor de coincidencias</div>
    <h1>Coincidencias</h1>
    <p class="page-intro">Reportes de otros usuarios que podrían estar relacionados con tu mascota.</p>

    <div class="explore-toolbar">
      <select v-model="filterKind" aria-label="Filtrar por tipo de reporte">
        <option value="Todos">Todos los tipos</option>
        <option value="Perdida">Perdida</option>
        <option value="Encontrada">Encontrada</option>
      </select>
      <select v-model="filterType" aria-label="Filtrar por especie">
        <option value="Todas">Todas las especies</option>
        <option value="Perro">Perro</option>
        <option value="Gato">Gato</option>
        <option value="Ave">Ave</option>
        <option value="Otro">Otro</option>
      </select>
      <select v-model.number="filterRadius" aria-label="Filtrar por distancia">
        <option v-for="opt in RADIUS_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
    </div>

    <div class="matches-map-section">
      <div class="section-head">
        <h2>Ubicación de referencia</h2>
        <span>{{ matchedReports.length }} resultado{{ matchedReports.length !== 1 ? 's' : '' }}</span>
      </div>
      <p class="map-hint">Arrastra el marcador para cambiar el centro de búsqueda.</p>
      <GoogleMapPicker
        :latitude="refLat"
        :longitude="refLng"
        :radius-meters="filterRadius"
        :other-markers="mapMarkers"
        :interactive="true"
        height="340px"
        @location-change="onReferenceMove"
      />
    </div>

    <div class="match-grid">
      <article v-for="{ ticket, distanceM } in reportsWithDistance" :key="ticket.id" class="match-feature">
        <img :src="ticket.image" :alt="ticket.name" />
        <div>
          <span class="match-score">{{ ticket.kind }} · {{ ticket.type }}</span>
          <h2>{{ ticket.name }}</h2>
          <p>{{ ticket.location }} · {{ ticket.breed || 'Raza no especificada' }}</p>
          <small v-if="distanceM !== null" class="match-distance">{{ formatDistance(distanceM) }} de distancia</small>
          <button class="secondary-button" @click="selectedTicket = ticket">Ver detalle</button>
        </div>
      </article>
      <div v-if="!matchedReports.length" class="empty-state">
        No hay coincidencias con los filtros seleccionados.
      </div>
    </div>
  </section>
  <div v-if="selectedTicket" class="modal-backdrop" @click.self="selectedTicket = null">
    <section class="modal detail-modal">
      <div class="modal-head">
        <div>
          <h2>{{ selectedTicket.name }}</h2>
          <p class="modal-intro">{{ selectedTicket.kind }} · {{ selectedTicket.location }}</p>
        </div>
        <button class="close-button" aria-label="Cerrar" @click="selectedTicket = null">✕</button>
      </div>
      <GoogleMapPicker
        :latitude="selectedTicket.latitude"
        :longitude="selectedTicket.longitude"
        :image-url="selectedTicket.image"
        :other-markers="otherReportsForMap"
        :interactive="false"
        height="360px"
      />
      <div class="detail-summary">
        <span>{{ selectedTicket.type }} · {{ selectedTicket.breed || 'Raza no especificada' }}</span>
        <strong>{{ selectedTicket.color || 'Color no especificado' }}</strong>
        <small>{{ selectedTicket.note }}</small>
      </div>
      <div class="owner-contact">
        <h3>Información del Propietario</h3>
        <div v-if="ownerContactInfo">
          <p><strong>Nombre:</strong> {{ ownerContactInfo.fullName || 'No especificado' }}</p>
          <p><strong>Teléfono:</strong> {{ ownerContactInfo.phoneNumber || 'No especificado' }}</p>
          <p><strong>Email:</strong> {{ ownerContactInfo.email || 'No especificado' }}</p>
        </div>
        <p v-else class="owner-contact-empty">No se encuentra información de contacto disponible.</p>

        <div v-if="selectedTicket.ownerId !== currentUser?.id" class="contact-actions">
          <button v-if="!showContactForm" class="primary-button" @click="showContactForm = true">
            Contactar al propietario
          </button>
          <form v-if="showContactForm" class="contact-form" @submit.prevent="submitContact">
            <label for="match-contact-message">Mensaje (Opcional)</label>
            <textarea
              id="match-contact-message"
              v-model="contactMessage"
              maxlength="200"
              placeholder="Ej: Hola, creo haber visto a tu mascota..."
            />
            <div class="contact-form-actions">
              <button type="button" class="secondary-button" @click="showContactForm = false">Cancelar</button>
              <button type="submit" class="primary-button">Enviar solicitud</button>
            </div>
          </form>
        </div>
        <p v-if="feedback.text" class="contact-feedback" :class="{ error: feedback.isError }">
          {{ feedback.text }}
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.matches-map-section {
  margin-bottom: 2rem;
}
.map-hint {
  font-size: 0.875rem;
  color: var(--color-text-muted, #718475);
  margin-bottom: 0.5rem;
}
.match-distance {
  display: block;
  font-size: 0.8125rem;
  color: var(--color-text-muted, #718475);
  margin-bottom: 0.5rem;
}
.owner-contact {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}
.owner-contact h3 {
  font-size: 1rem;
  margin-bottom: 0.5rem;
}
.owner-contact p {
  margin: 0;
  font-size: 0.9rem;
}
.owner-contact-empty {
  color: #666;
  font-style: italic;
}
.contact-actions {
  margin-top: 1rem;
}
.contact-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: #f9f9f9;
  padding: 1rem;
  border-radius: 8px;
}
.contact-form label {
  font-size: 0.85rem;
  font-weight: bold;
}
.contact-form textarea {
  min-height: 60px;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  resize: none;
  font: inherit;
  font-size: 0.9rem;
}
.contact-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.contact-feedback {
  margin-top: 1rem !important;
  color: #16a34a;
  font-weight: bold;
}
.contact-feedback.error {
  color: #dc2626;
}
</style>
