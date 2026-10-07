<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/Icon.vue'
import ReportFormModal from '@/components/ReportFormModal.vue'
import { tickets as allTickets } from '@/data/tickets'
import { getCurrentUser } from '@/services/authService'
import type { PetTicket, PetType, TicketKind } from '@/types'
import { usePetLabels } from '@/composables/usePetLabels'

const activeTab = ref<'Todas' | 'Activas' | 'Resueltas'>('Todas')
const search = ref('')
const showModal = ref(false)
const showToast = ref(false)
const editingTicket = ref<PetTicket | null>(null)
const initialModalData = ref<{ type?: PetType; kind?: TicketKind; name?: string; breed?: string; color?: string; description?: string } | null>(null)
const currentUser = computed(() => getCurrentUser())
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { reportKind, reportStatus, petType } = usePetLabels()

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
  initialModalData.value = null
  showModal.value = true
}

function openEdit(ticket: PetTicket) {
  editingTicket.value = ticket
  initialModalData.value = null
  showModal.value = true
}

async function deleteTicket(id: number) {
  if (!window.confirm(t('dashboard.deleteConfirm'))) return
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

watch(() => route.query.action, (action) => {
  if (action === 'create') {
    editingTicket.value = null
    initialModalData.value = {
      type: (route.query.type as PetType) || 'Perro',
      kind: (route.query.kind as TicketKind) || 'Perdida',
      name: (route.query.name as string) || '',
      breed: (route.query.breed as string) || '',
      color: (route.query.color as string) || '',
      description: (route.query.description as string) || '',
    }
    showModal.value = true
    void router.replace({ query: {} })
  }
}, { immediate: true })
</script>

<template>
  <section class="content-head">
    <div class="head-copy">
      <div class="eyebrow">{{ new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date()) }}</div>
      <h1>{{ t('dashboard.hello', { name: currentUser?.name || t('dashboard.friend') }) }} <span aria-hidden="true">☀</span></h1>
      <p>{{ t('dashboard.tagline') }}</p>
    </div>
    <button class="primary-button" @click="openCreate"><Icon name="plus" :size="17" /> {{ t('dashboard.createReport') }}</button>
  </section>

  <section class="stats-grid" :aria-label="t('accessibility.activitySummary')" data-tutorial="summary">
    <article class="stat-card">
      <div class="stat-top"><span>{{ t('dashboard.activeReports') }}</span><span class="stat-icon"><Icon name="paw" :size="15" /></span></div>
      <div class="stat-number">{{ userTickets.filter((t) => t.status === 'Activa').length }}</div>
      <span class="stat-note">{{ t('dashboard.following') }}</span>
    </article>
    <article class="stat-card">
      <div class="stat-top"><span>{{ t('dashboard.matches') }}</span><span class="stat-icon"><Icon name="heart" :size="15" /></span></div>
      <div class="stat-number">{{ userTickets.filter((t) => t.match > 0).length }}</div>
      <span class="stat-note">{{ t('dashboard.basedOnReports') }}</span>
    </article>
    <article class="stat-card">
      <div class="stat-top"><span>{{ t('dashboard.unreadMessages') }}</span><span class="stat-icon"><Icon name="message" :size="15" /></span></div>
      <div class="stat-number">0</div>
      <span class="stat-note">{{ t('dashboard.allCaughtUp') }}</span>
    </article>
    <article class="stat-card">
      <div class="stat-top"><span>{{ t('dashboard.resolvedCases') }}</span><span class="stat-icon"><Icon name="heart" :size="15" /></span></div>
      <div class="stat-number">{{ userTickets.filter((t) => t.status === 'Resuelta').length }}</div>
      <span class="stat-note">{{ t('dashboard.communityThanks') }}</span>
    </article>
  </section>

  <div class="workspace">
    <section>
      <div class="section-head">
        <h2>{{ t('dashboard.myReports') }}</h2>
        <RouterLink to="/reportes">{{ t('dashboard.viewAll') }} <Icon name="chevron" :size="13" /></RouterLink>
      </div>
      <div class="tabs">
        <button
          v-for="tab in ['Todas', 'Activas', 'Resueltas']"
          :key="tab"
          class="tab"
          :class="{ active: activeTab === tab }"
          @click="activeTab = tab as typeof activeTab"
        >
          {{ t(tab === 'Todas' ? 'common.all' : tab === 'Activas' ? 'common.active' : 'common.resolved') }}
          <span>({{ tab === 'Todas' ? userTickets.length : userTickets.filter((t) => t.status === (tab === 'Activas' ? 'Activa' : 'Resuelta')).length }})</span>
        </button>
      </div>
      <div class="ticket-list">
        <article v-for="ticket in filteredTickets" :key="ticket.id" class="ticket-row">
          <img class="pet-image" :src="ticket.image" :alt="t('common.reportPhotoAlt', { name: ticket.name })" />
          <div class="ticket-main">
            <h3>{{ ticket.name }} <span class="status" :class="{ resolved: ticket.status === 'Resuelta' }">{{ reportKind(ticket.kind) }} · {{ reportStatus(ticket.status) }}</span></h3>
            <div class="ticket-meta">
              <span><Icon name="map" :size="11" /> {{ ticket.location }}</span>
              <span>{{ ticket.date }}</span>
            </div>
            <p>{{ ticket.breed }} · {{ ticket.color }}<br>{{ ticket.note }}</p>
          </div>
          <div class="ticket-tools">
            <div class="ticket-match">
              <div class="match-ring">{{ ticket.match }}%</div>
              <span class="match-label">{{ t('common.similarity') }}</span>
            </div>
            <button class="text-button" @click="openEdit(ticket)">{{ t('dashboard.edit') }}</button>
            <button class="text-button danger" @click="deleteTicket(ticket.id)">{{ t('dashboard.delete') }}</button>
          </div>
        </article>
        <div v-if="filteredTickets.length === 0" class="empty-state">{{ t('dashboard.noReports') }}</div>
      </div>
    </section>

    <aside class="side-panel">
      <div class="search-box">
        <Icon name="search" :size="16" />
        <input v-model="search" type="search" :placeholder="t('dashboard.searchMyReports')" :aria-label="t('accessibility.searchReports')" />
      </div>
      <section class="side-section">
        <div class="section-head">
          <h3>{{ t('dashboard.recentMatches') }}</h3>
          <RouterLink to="/explorar">{{ t('dashboard.viewAllMatches') }}</RouterLink>
        </div>
        <div v-for="ticket in userTickets.slice(0, 3)" :key="`match-${ticket.id}`" class="match-card">
          <img :src="ticket.image" :alt="ticket.name" />
          <div>
            <strong>{{ ticket.name }} · {{ ticket.location.split(' ')[0] }}</strong>
            <small>{{ ticket.timeAgo }} · {{ petType(ticket.type) }}</small>
          </div>
          <span class="match-score">{{ ticket.match }}%</span>
        </div>
      </section>
    </aside>
  </div>

  <ReportFormModal
    :visible="showModal"
    :editing-ticket="editingTicket"
    :initial-data="initialModalData"
    :other-markers-for-map="otherMarkersForMap"
    @close="showModal = false"
    @saved="onModalSaved"
  />

  <div v-if="showToast" class="success-toast">{{ t('dashboard.toastSaved') }}</div>
</template>
