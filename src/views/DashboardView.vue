<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import ReportFormModal from '@/components/ReportFormModal.vue'
import { tickets as allTickets } from '@/data/tickets'
import { getCurrentUser } from '@/services/authService'
import type { PetTicket } from '@/types'

const activeTab = ref<'Todas' | 'Activas' | 'Resueltas'>('Todas')
const search = ref('')
const showModal = ref(false)
const showToast = ref(false)
const editingTicket = ref<PetTicket | null>(null)
const currentUser = computed(() => getCurrentUser())
const route = useRoute()
const router = useRouter()

const userTickets = computed(() => allTickets.filter((ticket) => ticket.ownerId === currentUser.value?.id))
const filteredTickets = computed(() => userTickets.value.filter((ticket) => {
  const matchesTab = activeTab.value === 'Todas' || (activeTab.value === 'Activas' ? ticket.status === 'Activa' : ticket.status === 'Resuelta')
  const query = search.value.toLowerCase()
  return matchesTab && [ticket.name, ticket.location, ticket.kind, ticket.type, ticket.breed].some((value) => value.toLowerCase().includes(query))
}))

const otherMarkersForMap = computed(() =>
  allTickets
    .filter((ticket) => ticket.id !== editingTicket.value?.id)
    .map((ticket) => ({ latitude: ticket.latitude, longitude: ticket.longitude, image: ticket.image, name: ticket.name }))
)

function openCreate() {
  editingTicket.value = null
  showModal.value = true
}

function openEdit(ticket: PetTicket) {
  editingTicket.value = ticket
  showModal.value = true
}

async function deleteTicket(id: number) {
  if (!window.confirm('¿Eliminar este reporte? Esta acción no se puede deshacer.')) return
  const { removeTicket } = await import('@/data/tickets')
  try { await removeTicket(id) } catch { return }
  showToast.value = true
  window.setTimeout(() => { showToast.value = false }, 3000)
}

function onModalSaved() {
  showModal.value = false
  showToast.value = true
  window.setTimeout(() => { showToast.value = false }, 3000)
}

onMounted(() => {
  if (route.query.action === 'create') {
    openCreate()
    void router.replace({ query: {} })
  }
})
</script>

<template>
  <section class="content-head">
    <div class="head-copy">
      <div class="eyebrow">Viernes, 21 de agosto de 2026</div>
      <h1>Hola, {{ currentUser?.name || 'amigo' }} <span aria-hidden="true">☀</span></h1>
      <p>Un pequeño paso puede llevarlos de vuelta a casa.</p>
    </div>
    <button class="primary-button" @click="openCreate"><Icon name="plus" :size="17" /> Reportar mascota</button>
  </section>

  <section class="stats-grid" aria-label="Resumen de actividad" data-tutorial="summary">
    <article class="stat-card">
      <div class="stat-top"><span>Reportes activos</span><span class="stat-icon"><Icon name="paw" :size="15" /></span></div>
      <div class="stat-number">{{ userTickets.filter((t) => t.status === 'Activa').length }}</div>
      <span class="stat-note">En seguimiento</span>
    </article>
    <article class="stat-card">
      <div class="stat-top"><span>Coincidencias</span><span class="stat-icon"><Icon name="heart" :size="15" /></span></div>
      <div class="stat-number">{{ userTickets.filter((t) => t.match > 0).length }}</div>
      <span class="stat-note">Basadas en tus reportes</span>
    </article>
    <article class="stat-card">
      <div class="stat-top"><span>Mensajes sin leer</span><span class="stat-icon"><Icon name="message" :size="15" /></span></div>
      <div class="stat-number">0</div>
      <span class="stat-note">Todo al día</span>
    </article>
    <article class="stat-card">
      <div class="stat-top"><span>Casos resueltos</span><span class="stat-icon"><Icon name="heart" :size="15" /></span></div>
      <div class="stat-number">{{ userTickets.filter((t) => t.status === 'Resuelta').length }}</div>
      <span class="stat-note">Gracias a la comunidad</span>
    </article>
  </section>

  <div class="workspace">
    <section>
      <div class="section-head">
        <h2>Mis reportes</h2>
        <RouterLink to="/reportes">Ver todos <Icon name="chevron" :size="13" /></RouterLink>
      </div>
      <div class="tabs">
        <button
          v-for="tab in ['Todas', 'Activas', 'Resueltas']"
          :key="tab"
          class="tab"
          :class="{ active: activeTab === tab }"
          @click="activeTab = tab as typeof activeTab"
        >
          {{ tab }}
          <span>({{ tab === 'Todas' ? userTickets.length : userTickets.filter((t) => t.status === (tab === 'Activas' ? 'Activa' : 'Resuelta')).length }})</span>
        </button>
      </div>
      <div class="ticket-list">
        <article v-for="ticket in filteredTickets" :key="ticket.id" class="ticket-row">
          <img class="pet-image" :src="ticket.image" :alt="`Foto de ${ticket.name}`" />
          <div class="ticket-main">
            <h3>{{ ticket.name }} <span class="status" :class="{ resolved: ticket.status === 'Resuelta' }">{{ ticket.kind }} · {{ ticket.status }}</span></h3>
            <div class="ticket-meta">
              <span><Icon name="map" :size="11" /> {{ ticket.location }}</span>
              <span>{{ ticket.date }}</span>
            </div>
            <p>{{ ticket.breed }} · {{ ticket.color }}<br>{{ ticket.note }}</p>
          </div>
          <div class="ticket-tools">
            <div class="ticket-match">
              <div class="match-ring">{{ ticket.match }}%</div>
              <span class="match-label">similitud</span>
            </div>
            <button class="text-button" @click="openEdit(ticket)">Editar</button>
            <button class="text-button danger" @click="deleteTicket(ticket.id)">Eliminar</button>
          </div>
        </article>
        <div v-if="filteredTickets.length === 0" class="empty-state">No encontramos reportes para esta cuenta.</div>
      </div>
    </section>

    <aside class="side-panel">
      <div class="search-box">
        <Icon name="search" :size="16" />
        <input v-model="search" type="search" placeholder="Buscar en mis reportes" aria-label="Buscar reportes" />
      </div>
      <section class="side-section">
        <div class="section-head">
          <h3>Coincidencias recientes</h3>
          <RouterLink to="/explorar">Ver todas</RouterLink>
        </div>
        <div v-for="ticket in userTickets.slice(0, 3)" :key="`match-${ticket.id}`" class="match-card">
          <img :src="ticket.image" :alt="ticket.name" />
          <div>
            <strong>{{ ticket.name }} · {{ ticket.location.split(' ')[0] }}</strong>
            <small>{{ ticket.timeAgo }} · {{ ticket.type }}</small>
          </div>
          <span class="match-score">{{ ticket.match }}%</span>
        </div>
      </section>
    </aside>
  </div>

  <ReportFormModal
    :visible="showModal"
    :editing-ticket="editingTicket"
    :other-markers-for-map="otherMarkersForMap"
    @close="showModal = false"
    @saved="onModalSaved"
  />

  <div v-if="showToast" class="success-toast">Cambios guardados correctamente.</div>
</template>
