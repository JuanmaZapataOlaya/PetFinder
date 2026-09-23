<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import GoogleMapPicker from '@/components/GoogleMapPicker.vue'
import Icon from '@/components/Icon.vue'
import ContactRequestForm from '@/components/ContactRequestForm.vue'
import { tickets } from '@/data/tickets'
import type { PetTicket, PetType, TicketKind } from '@/types'
import { getCurrentUser } from '@/services/authService'
import { getContactInfo } from '@/services/contactService'
import { searchPets } from '@/services/petSearchService'

const DEFAULT_SEARCH_QUERY = 'findall'
const RESULTS_PER_PAGE = 6

const RADIUS_OPTIONS = [
  { label: '500 m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '3 km', value: 3000 },
  { label: '5 km', value: 5000 },
  { label: '20 km', value: 20000 },
  { label: '100 km', value: 100000 },
  { label : 'INF', value : 0}
]

const route = useRoute()
const search = ref('')
const searchResults = ref<PetTicket[]>([])
const searchError = ref('')
const searching = ref(false)
const currentPage = ref(1)
const kind = ref<'Todos' | TicketKind>('Todos')
const type = ref<'Todas' | PetType>('Todas')
const filterKind = ref<'Todos' | TicketKind>('Todos')
const filterType = ref<'Todas' | PetType>('Todas')
const filterRadius = ref(500)
const refLat = ref(19.4326)
const refLng = ref(-99.1332)
const selectedTicket = ref<PetTicket | null>(null)
const ownerContactInfo = ref<{ fullName?: string; phoneNumber?: string; email?: string } | null>(null)
const showContactForm = ref(false)
const currentUser = computed(() => getCurrentUser())

const publicTickets = computed(() => searchResults.value.filter((ticket) =>
  (kind.value === 'Todos' || ticket.kind === kind.value) &&
  (type.value === 'Todas' || ticket.type === type.value)
))

const totalPages = computed(() => Math.max(1, Math.ceil(publicTickets.value.length / RESULTS_PER_PAGE)))

const paginatedPublicTickets = computed(() => {
  const start = (currentPage.value - 1) * RESULTS_PER_PAGE
  return publicTickets.value.slice(start, start + RESULTS_PER_PAGE)
})

async function submitSearch(query: string) {
  searching.value = true
  searchError.value = ''
  try {
    const results = await searchPets(query)
    searchResults.value = results
  } catch (error) {
    searchError.value = error instanceof Error ? error.message : 'No fue posible realizar la búsqueda.'
  } finally {
    searching.value = false
  }
}

function handleSearchSubmit() {
  void submitSearch(search.value)
}

function goToPreviousPage() {
  if (currentPage.value > 1) currentPage.value -= 1
}

function goToNextPage() {
  if (currentPage.value < totalPages.value) currentPage.value += 1
}

watch([searchResults, kind, type], () => {
  currentPage.value = 1
})

watch(() => route.query.q, (value) => {
  if (typeof value === 'string' && value.trim()) {
    search.value = value
    void submitSearch(search.value)
    return
  }

  search.value = ''
  void submitSearch(DEFAULT_SEARCH_QUERY)
}, { immediate: true })

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadius = 6_371_000
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return earthRadius * 2 * Math.asin(Math.sqrt(a))
}

const matchedReports = computed(() => tickets.filter((ticket) => {
  if (ticket.ownerId === currentUser.value?.id) return false
  if (filterKind.value !== 'Todos' && ticket.kind !== filterKind.value) return false
  if (filterType.value !== 'Todas' && ticket.type !== filterType.value) return false
  return filterRadius.value === 0 ||
    haversineMeters(refLat.value, refLng.value, ticket.latitude, ticket.longitude) <= filterRadius.value
}))

const reportsWithDistance = computed(() => matchedReports.value.map((ticket) => ({
  ticket,
  distanceM: filterRadius.value > 0
    ? Math.round(haversineMeters(refLat.value, refLng.value, ticket.latitude, ticket.longitude))
    : null,
})))

const mapMarkers = computed(() => matchedReports.value.map((ticket) => ({
  latitude: ticket.latitude,
  longitude: ticket.longitude,
  image: ticket.image,
  name: ticket.name,
})))

const otherReportsForMap = computed(() => {
  const source = selectedTicket.value && matchedReports.value.some((ticket) => ticket.id === selectedTicket.value?.id)
    ? matchedReports.value
    : publicTickets.value
  return source
    .filter((ticket) => ticket.id !== selectedTicket.value?.id)
    .map((ticket) => ({ latitude: ticket.latitude, longitude: ticket.longitude, image: ticket.image, name: ticket.name }))
})

watch(selectedTicket, async (newTicket) => {
  showContactForm.value = false
  if (newTicket) {
    const contact = await getContactInfo(newTicket.ownerId)
    ownerContactInfo.value = contact ? { fullName: contact.fullName, phoneNumber: contact.phoneNumber, email: contact.email } : null
  } else {
    ownerContactInfo.value = null
  }
})

const firstOwnTicket = tickets.find((ticket) => ticket.ownerId === currentUser.value?.id)
if (firstOwnTicket) {
  refLat.value = firstOwnTicket.latitude
  refLng.value = firstOwnTicket.longitude
}

function onReferenceMove(location: { latitude: number; longitude: number }) {
  refLat.value = location.latitude
  refLng.value = location.longitude
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`
}
</script>

<template>
  <section class="page-view unified-explore">
    <div class="eyebrow">Comunidad PetFinder</div>
    <h1>Explorar reportes</h1>
    <p class="page-intro">Encuentra mascotas reportadas y revisa coincidencias cerca de ti.</p>

    <section class="explore-section" aria-label="Explorar reportes">
      <div class="unified-section-heading">
        <div>
          <div class="eyebrow">Comunidad</div>
          <p>Consulta las mascotas perdidas y encontradas cerca de ti.</p>
        </div>
        <span class="section-count">{{ publicTickets.length }} reportes</span>
      </div>
      <form class="explore-toolbar" @submit.prevent="handleSearchSubmit">
        <div class="search-box"><Icon name="search" :size="16" /><input v-model="search" type="search" placeholder="Buscar por nombre, zona o raza" aria-label="Buscar reportes públicos" /></div>
        <button class="primary-button search-submit" type="submit" :disabled="searching"><Icon name="search" :size="15" />{{ searching ? 'Buscando...' : 'Buscar' }}</button>
        <select v-model="kind" aria-label="Filtrar reportes por tipo"><option>Todos</option><option>Perdida</option><option>Encontrada</option></select>
        <select v-model="type" aria-label="Filtrar reportes por especie"><option>Todas</option><option>Perro</option><option>Gato</option><option>Ave</option><option>Otro</option></select>
      </form>
      <p v-if="searchError" class="search-error" role="alert">{{ searchError }}</p>
      <div class="explore-layout">
        <div class="public-report-grid">
          <article v-for="ticket in paginatedPublicTickets" :key="ticket.id" class="public-report-card">
            <img :src="ticket.image" :alt="`Foto de ${ticket.name}`" />
            <div class="public-report-content">
              <span class="status" :class="{ resolved: ticket.status === 'Resuelta' }">{{ ticket.kind }} · {{ ticket.status }}</span>
              <h2>{{ ticket.name }}</h2>
              <p>{{ ticket.type }} · {{ ticket.breed || 'Raza no especificada' }}</p>
              <small>{{ ticket.location }} · {{ ticket.date }}</small>
              <button class="secondary-button" @click="selectedTicket = ticket">Ver en el mapa</button>
            </div>
          </article>
          <div v-if="!publicTickets.length" class="empty-state">No hay reportes que coincidan con estos filtros.</div>
          <p class="search-help">¿ No ves a tu mascota ?, utiliza la barra de busqueda para más resultados</p>
          <nav v-if="publicTickets.length && totalPages > 1" class="pagination" aria-label="Paginación de reportes">
            <button class="secondary-button" type="button" :disabled="currentPage === 1" @click="goToPreviousPage">Anterior</button>
            <span>Página {{ currentPage }} de {{ totalPages }}</span>
            <button class="secondary-button" type="button" :disabled="currentPage === totalPages" @click="goToNextPage">Siguiente</button>
          </nav>
        </div>
        <aside class="explore-map-panel">
          <div class="section-head"><h3>Ubicaciones reportadas</h3><span>{{ publicTickets.length }}</span></div>
          <div v-if="paginatedPublicTickets.length" class="public-map-list">
            <button v-for="ticket in paginatedPublicTickets" :key="`map-${ticket.id}`" class="public-map-item" @click="selectedTicket = ticket">
              <img :src="ticket.image" :alt="ticket.name" /><span><strong>{{ ticket.name }}</strong><small>{{ ticket.location }}</small></span><b>{{ ticket.kind }}</b>
            </button>
          </div>
          <p v-else class="empty-state">Sin ubicaciones.</p>
        </aside>
      </div>
    </section>

    <section class="matches-section" aria-labelledby="matches-title">
      <div class="unified-section-heading">
        <div>
          <div class="eyebrow">Motor de coincidencias</div>
          <h2 id="matches-title">Coincidencias</h2>
          <p>Reportes de otros usuarios que podrían estar relacionados con tu mascota.</p>
        </div>
        <span class="section-count">{{ matchedReports.length }} resultados</span>
      </div>
      <div class="explore-toolbar">
        <select v-model="filterKind" aria-label="Filtrar coincidencias por tipo"><option value="Todos">Todos los tipos</option><option value="Perdida">Perdida</option><option value="Encontrada">Encontrada</option></select>
        <select v-model="filterType" aria-label="Filtrar coincidencias por especie"><option value="Todas">Todas las especies</option><option value="Perro">Perro</option><option value="Gato">Gato</option><option value="Ave">Ave</option><option value="Otro">Otro</option></select>
        <select v-model.number="filterRadius" aria-label="Filtrar coincidencias por distancia"><option v-for="option in RADIUS_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select>
      </div>
      <div class="matches-map-section">
        <div class="section-head"><h3>Ubicación de referencia</h3><span>{{ matchedReports.length }} resultado{{ matchedReports.length !== 1 ? 's' : '' }}</span></div>
        <p class="map-hint">Arrastra el marcador para cambiar el centro de búsqueda.</p>
        <GoogleMapPicker :latitude="refLat" :longitude="refLng" :radius-meters="filterRadius" :other-markers="mapMarkers" :interactive="true" height="340px" @location-change="onReferenceMove" />
      </div>
      <div class="match-grid">
        <article v-for="{ ticket, distanceM } in reportsWithDistance" :key="ticket.id" class="match-feature">
          <img :src="ticket.image" :alt="ticket.name" />
          <div><span class="match-score">{{ ticket.kind }} · {{ ticket.type }}</span><h2>{{ ticket.name }}</h2><p>{{ ticket.location }} · {{ ticket.breed || 'Raza no especificada' }}</p><small v-if="distanceM !== null" class="match-distance">{{ formatDistance(distanceM) }} de distancia</small><button class="secondary-button" @click="selectedTicket = ticket">Ver detalle</button></div>
        </article>
        <div v-if="!matchedReports.length" class="empty-state">No hay coincidencias con los filtros seleccionados.</div>
      </div>
    </section>
  </section>

  <div v-if="selectedTicket" class="modal-backdrop" @click.self="selectedTicket = null">
    <section class="modal detail-modal">
      <div class="modal-head"><div><h2>{{ selectedTicket.name }}</h2><p class="modal-intro">{{ selectedTicket.kind }} · {{ selectedTicket.location }}</p></div><button class="close-button" aria-label="Cerrar" @click="selectedTicket = null">Cerrar</button></div>
      <GoogleMapPicker :latitude="selectedTicket.latitude" :longitude="selectedTicket.longitude" :image-url="selectedTicket.image" :other-markers="otherReportsForMap" :interactive="false" height="360px" />
      <div class="detail-summary"><span>{{ selectedTicket.type }} · {{ selectedTicket.breed || 'Raza no especificada' }}</span><strong>{{ selectedTicket.color || 'Color no especificado' }}</strong><small>{{ selectedTicket.note }}</small></div>
      <div class="owner-contact"><h3>Información del Propietario</h3><div v-if="ownerContactInfo"><p><strong>Nombre:</strong> {{ ownerContactInfo.fullName || 'No especificado' }}</p><p><strong>Teléfono:</strong> {{ ownerContactInfo.phoneNumber || 'No especificado' }}</p><p><strong>Email:</strong> {{ ownerContactInfo.email || 'No especificado' }}</p></div><p v-else class="owner-contact-empty">No se encuentra información de contacto disponible.</p>
        <div v-if="selectedTicket.ownerId !== currentUser?.id" class="contact-actions">
          <button v-if="!showContactForm" class="primary-button" @click="showContactForm = true">Contactar al propietario</button>
          <ContactRequestForm
            v-if="showContactForm"
            :ticket="selectedTicket"
            @close="showContactForm = false"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.unified-explore { max-width: 1320px; min-width: 0; margin: 0 auto; }
.explore-layout, .public-report-grid, .match-grid { min-width: 0; }
.explore-toolbar { grid-template-columns: minmax(220px, 1fr) auto 150px 150px; }
.explore-toolbar .search-submit:disabled { opacity: .6; cursor: wait; }
.search-error { margin: -14px 0 20px; color: #b5533e; font-size: 12px; }
.search-help { grid-column: 1 / -1; margin: 18px 0 0; color: #758178; font-size: 13px; text-align: center; }
.pagination { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 6px; }
.pagination span { color: #758178; font-size: 12px; }
.pagination .secondary-button:disabled { opacity: .5; cursor: not-allowed; }
.explore-section, .matches-section { padding: 28px 0 34px; }
.matches-section { border-top: 1px solid #dfe8dc; }
.unified-section-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
.unified-section-heading h2 { margin: 6px 0 5px; font-family: 'Space Grotesk', sans-serif; font-size: 24px; }
.unified-section-heading p { margin: 0; color: #758178; font-size: 13px; }
.section-count { color: #628c4f; font-size: 12px; font-weight: 700; white-space: nowrap; }
.matches-map-section { margin-bottom: 2rem; }
.map-hint, .match-distance { color: #718475; font-size: .8125rem; }
.match-distance { display: block; margin-bottom: .5rem; }
.owner-contact { margin-top: 1.5rem; border-top: 1px solid #eee; padding-top: 1rem; }
.owner-contact h3 { margin-bottom: .5rem; font-size: 1rem; }
.owner-contact p { margin: 0; font-size: .9rem; }
.owner-contact-empty { color: #666; font-style: italic; }
.contact-actions { margin-top: 1rem; }
@media (max-width: 950px) {
  .explore-layout { grid-template-columns: 1fr; }
  .explore-map-panel { padding-left: 0; }
  .match-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 650px) { .unified-section-heading { align-items: flex-start; flex-direction: column; gap: 8px; } .explore-section, .matches-section { padding-top: 22px; } .explore-toolbar { grid-template-columns: 1fr; } .explore-toolbar .search-submit { width: 100%; justify-content: center; } }
@media (max-width: 650px) {
  .public-report-grid, .match-grid { grid-template-columns: minmax(0, 1fr); }
  .public-report-card > img { height: 190px; }
}
</style>
