<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import GoogleMapPicker from '@/components/GoogleMapPicker.vue'
import Icon from '@/components/Icon.vue'
import ContactRequestForm from '@/components/ContactRequestForm.vue'
import { tickets } from '@/data/tickets'
import type { PetTicket, PetType, TicketKind } from '@/types'
import { getCurrentUser } from '@/services/authService'
import { getContactInfo } from '@/services/contactService'
import { searchPets } from '@/services/petSearchService'
import { usePetLabels } from '@/composables/usePetLabels'

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
const { t } = useI18n()
const { reportKind, reportStatus, petType } = usePetLabels()
const search = ref('')
const searchResults = ref<PetTicket[]>([])
const searchError = ref('')
const searching = ref(false)
const currentPage = ref(1)
const kind = ref<TicketKind | ''>('')
const type = ref<PetType | ''>('')
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
  (!kind.value || ticket.kind === kind.value) &&
  (!type.value || ticket.type === type.value)
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
    const results = await searchPets(query, {
      type: type.value || undefined,
      kind: kind.value || undefined,
    })
    searchResults.value = results
  } catch (error) {
    searchError.value = error instanceof Error ? error.message : t('explore.searchFailed')
  } finally {
    searching.value = false
  }
}

function handleSearchSubmit() {
  void submitSearch(search.value)
}

function applySearchFilters() {
  void submitSearch(search.value.trim() || DEFAULT_SEARCH_QUERY)
}

function removeKindFilter() {
  kind.value = ''
}

function removeTypeFilter() {
  type.value = ''
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

watch([kind, type], applySearchFilters)

const TICKET_KINDS: TicketKind[] = ['Perdida', 'Encontrada']
const PET_TYPES: PetType[] = ['Perro', 'Gato', 'Ave', 'Otro']

function readQueryOption<T extends string>(value: unknown, options: T[]): T | '' {
  return options.includes(value as T) ? value as T : ''
}

watch(() => [route.query.q, route.query.kind, route.query.type], ([queryValue, kindValue, typeValue]) => {
  search.value = typeof queryValue === 'string' ? queryValue.trim() : ''
  const nextKind = readQueryOption(kindValue, TICKET_KINDS)
  const nextType = readQueryOption(typeValue, PET_TYPES)
  const filtersChanged = nextKind !== kind.value || nextType !== type.value
  kind.value = nextKind
  type.value = nextType
  // When the filters change, their own watcher already runs the search.
  if (!filtersChanged) void submitSearch(search.value || DEFAULT_SEARCH_QUERY)
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
    <div class="eyebrow">{{ t('explore.heading') }}</div>
    <h1>{{ t('explore.title') }}</h1>
    <p class="page-intro">{{ t('explore.intro') }}</p>

    <section class="explore-section" :aria-label="t('explore.title')">
      <div class="unified-section-heading">
        <div>
          <div class="eyebrow">{{ t('explore.community') }}</div>
          <p>{{ t('explore.nearby') }}</p>
        </div>
        <span class="section-count">{{ t('explore.reportCount', { count: publicTickets.length }) }}</span>
      </div>
      <form class="explore-toolbar" data-tutorial="explore-search" @submit.prevent="handleSearchSubmit">
        <div class="search-box"><Icon name="search" :size="16" /><input v-model="search" type="search" :placeholder="t('explore.searchPlaceholder')" :aria-label="t('accessibility.publicReports')" /></div>
        <button class="primary-button search-submit" type="submit" :disabled="searching"><Icon name="search" :size="15" />{{ searching ? t('common.searching') : t('common.search') }}</button>
        <select v-model="kind" :aria-label="t('explore.filterKind')"><option value="">{{ t('common.allTypes') }}</option><option value="Perdida">{{ t('common.lost') }}</option><option value="Encontrada">{{ t('common.found') }}</option></select>
        <select v-model="type" :aria-label="t('explore.filterSpecies')"><option value="">{{ t('common.allSpecies') }}</option><option value="Perro">{{ t('common.dog') }}</option><option value="Gato">{{ t('common.cat') }}</option><option value="Ave">{{ t('common.bird') }}</option><option value="Otro">{{ t('common.other') }}</option></select>
      </form>
      <div v-if="kind || type" class="active-filters" :aria-label="t('accessibility.activeFilters')">
        <span v-if="kind" class="filter-chip">
          <span>{{ t('explore.typeLabel', { value: reportKind(kind) }) }}</span>
          <button class="filter-chip-remove" type="button" :aria-label="t('accessibility.removeTypeFilter')" :title="t('explore.removeFilter')" @click="removeKindFilter"><Icon name="x" :size="13" /></button>
        </span>
        <span v-if="type" class="filter-chip">
          <span>{{ t('explore.speciesLabel', { value: petType(type) }) }}</span>
          <button class="filter-chip-remove" type="button" :aria-label="t('accessibility.removeSpeciesFilter')" :title="t('explore.removeFilter')" @click="removeTypeFilter"><Icon name="x" :size="13" /></button>
        </span>
      </div>
      <p v-if="searchError" class="search-error" role="alert">{{ searchError }}</p>
      <div class="explore-layout">
        <div class="public-report-grid">
          <article v-for="ticket in paginatedPublicTickets" :key="ticket.id" class="public-report-card">
            <img :src="ticket.image" :alt="t('common.reportPhotoAlt', { name: ticket.name })" />
            <div class="public-report-content">
              <span class="status" :class="{ resolved: ticket.status === 'Resuelta' }">{{ reportKind(ticket.kind) }} · {{ reportStatus(ticket.status) }}</span>
              <h2>{{ ticket.name }}</h2>
              <p>{{ petType(ticket.type) }} · {{ ticket.breed || t('common.noBreed') }}</p>
              <small>{{ ticket.location }} · {{ ticket.date }}</small>
              <button class="secondary-button" @click="selectedTicket = ticket">{{ t('explore.viewOnMap') }}</button>
            </div>
          </article>
          <div v-if="!publicTickets.length" class="empty-state">{{ t('explore.noReportsMatch') }}</div>
          <p class="search-help">{{ t('explore.searchHelp') }}</p>
          <nav v-if="publicTickets.length && totalPages > 1" class="pagination" :aria-label="t('accessibility.reportPagination')">
            <button class="secondary-button" type="button" :disabled="currentPage === 1" @click="goToPreviousPage">{{ t('common.previous') }}</button>
            <span>{{ t('common.pageOf', { page: currentPage, total: totalPages }) }}</span>
            <button class="secondary-button" type="button" :disabled="currentPage === totalPages" @click="goToNextPage">{{ t('common.next') }}</button>
          </nav>
        </div>
        <aside class="explore-map-panel">
          <div class="section-head"><h3>{{ t('explore.reportedLocations') }}</h3><span>{{ publicTickets.length }}</span></div>
          <div v-if="paginatedPublicTickets.length" class="public-map-list">
            <button v-for="ticket in paginatedPublicTickets" :key="`map-${ticket.id}`" class="public-map-item" @click="selectedTicket = ticket">
              <img :src="ticket.image" :alt="ticket.name" /><span><strong>{{ ticket.name }}</strong><small>{{ ticket.location }}</small></span><b>{{ reportKind(ticket.kind) }}</b>
            </button>
          </div>
          <p v-else class="empty-state">{{ t('explore.noLocations') }}</p>
        </aside>
      </div>
    </section>

    <section id="matches" class="matches-section" aria-labelledby="matches-title">
      <div class="unified-section-heading">
        <div>
          <div class="eyebrow">{{ t('explore.matchesEngine') }}</div>
          <h2 id="matches-title">{{ t('explore.matchesTitle') }}</h2>
          <p>{{ t('explore.matchesIntro') }}</p>
        </div>
        <span class="section-count">{{ t('explore.matchCount', { count: matchedReports.length }) }}</span>
      </div>
      <div class="explore-toolbar" data-tutorial="match-filters">
        <select v-model="filterKind" :aria-label="t('explore.filterMatchesKind')"><option value="Todos">{{ t('common.allTypes') }}</option><option value="Perdida">{{ t('common.lost') }}</option><option value="Encontrada">{{ t('common.found') }}</option></select>
        <select v-model="filterType" :aria-label="t('explore.filterMatchesSpecies')"><option value="Todas">{{ t('common.allSpecies') }}</option><option value="Perro">{{ t('common.dog') }}</option><option value="Gato">{{ t('common.cat') }}</option><option value="Ave">{{ t('common.bird') }}</option><option value="Otro">{{ t('common.other') }}</option></select>
        <select v-model.number="filterRadius" :aria-label="t('explore.filterDistance')"><option v-for="option in RADIUS_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select>
      </div>
      <div class="matches-map-section">
        <div class="section-head"><h3>{{ t('explore.referenceLocation') }}</h3><span>{{ t('explore.resultCount', matchedReports.length) }}</span></div>
        <p class="map-hint">{{ t('explore.mapHint') }}</p>
        <GoogleMapPicker :latitude="refLat" :longitude="refLng" :radius-meters="filterRadius" :other-markers="mapMarkers" :interactive="true" height="340px" @location-change="onReferenceMove" />
      </div>
      <div class="match-grid">
        <article v-for="{ ticket, distanceM } in reportsWithDistance" :key="ticket.id" class="match-feature">
          <img :src="ticket.image" :alt="ticket.name" />
          <div><span class="match-score">{{ reportKind(ticket.kind) }} · {{ petType(ticket.type) }}</span><h2>{{ ticket.name }}</h2><p>{{ ticket.location }} · {{ ticket.breed || t('common.noBreed') }}</p><small v-if="distanceM !== null" class="match-distance">{{ formatDistance(distanceM) }} {{ t('common.distance') }}</small><button class="secondary-button" @click="selectedTicket = ticket">{{ t('explore.viewDetails') }}</button></div>
        </article>
        <div v-if="!matchedReports.length" class="empty-state">{{ t('explore.noMatches') }}</div>
      </div>
    </section>
  </section>

  <div v-if="selectedTicket" class="modal-backdrop" @click.self="selectedTicket = null">
    <section class="modal detail-modal">
      <div class="modal-head"><div><h2>{{ selectedTicket.name }}</h2><p class="modal-intro">{{ reportKind(selectedTicket.kind) }} · {{ selectedTicket.location }}</p></div><button class="close-button" :aria-label="t('common.close')" @click="selectedTicket = null">{{ t('common.close') }}</button></div>
      <GoogleMapPicker :latitude="selectedTicket.latitude" :longitude="selectedTicket.longitude" :image-url="selectedTicket.image" :other-markers="otherReportsForMap" :interactive="false" height="360px" />
      <div class="detail-summary"><span>{{ petType(selectedTicket.type) }} · {{ selectedTicket.breed || t('common.noBreed') }}</span><strong>{{ selectedTicket.color || t('common.noColor') }}</strong><small>{{ selectedTicket.note }}</small></div>
      <div class="owner-contact"><h3>{{ t('common.ownerInformation') }}</h3><div v-if="ownerContactInfo"><p><strong>{{ t('common.name') }}:</strong> {{ ownerContactInfo.fullName || t('common.notSpecified') }}</p><p><strong>{{ t('common.phone') }}:</strong> {{ ownerContactInfo.phoneNumber || t('common.notSpecified') }}</p><p><strong>{{ t('common.email') }}:</strong> {{ ownerContactInfo.email || t('common.notSpecified') }}</p></div><p v-else class="owner-contact-empty">{{ t('common.noContactInfo') }}</p>
        <div v-if="selectedTicket.ownerId !== currentUser?.id" class="contact-actions">
          <p class="proof-notice">
            <template v-if="selectedTicket.kind === 'Perdida'">{{ t('explore.lostProof') }}</template>
            <template v-else>{{ t('explore.foundProof') }}</template>
          </p>
          <button v-if="!showContactForm" class="primary-button" @click="showContactForm = true">{{ t('explore.contactOwner') }}</button>
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
.active-filters { display: flex; flex-wrap: wrap; gap: 8px; margin: -8px 0 20px; }
.filter-chip { display: inline-flex; align-items: center; gap: 4px; min-height: 28px; border: 1px solid #b9d0ae; border-radius: 999px; padding: 4px 6px 4px 11px; background: #f2f8ef; color: #42623a; font-size: 12px; font-weight: 700; }
.filter-chip-remove { display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center; border: 0; border-radius: 50%; padding: 0; background: transparent; color: #42623a; opacity: 0; cursor: pointer; transition: opacity .15s ease, background-color .15s ease; }
.filter-chip:hover .filter-chip-remove, .filter-chip-remove:focus-visible { opacity: 1; }
.filter-chip-remove:hover { background: #dbead5; }
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
.proof-notice { margin-bottom: .75rem !important; color: #42623a; font-size: .85rem !important; font-weight: 600; }
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
