<script setup lang="ts">
import { computed } from 'vue'
import { tickets } from '@/data/tickets'
import { getCurrentUser } from '@/services/authService'

import { ref } from 'vue'
import GoogleMapPicker from '@/components/GoogleMapPicker.vue'
import type { PetTicket } from '@/types'

const currentUser = computed(() => getCurrentUser())
const userTickets = computed(() => tickets.filter((ticket) => ticket.ownerId === currentUser.value?.id))
const selectedTicket = ref<PetTicket | null>(null)
const otherReportsForMap = computed(() => tickets.filter((ticket) => ticket.id !== selectedTicket.value?.id).map((ticket) => ({ latitude: ticket.latitude, longitude: ticket.longitude, image: ticket.image, name: ticket.name })))
</script>

<template>
  <section class="page-view" data-tutorial="reports"><div class="eyebrow">Gestión</div><h1>Mis reportes</h1><p class="page-intro">Administra tus reportes activos y revisa los casos resueltos.</p><div class="ticket-list"><article v-for="ticket in userTickets" :key="ticket.id" class="ticket-row"><img class="pet-image" :src="ticket.image" :alt="ticket.name" /><div class="ticket-main"><h3>{{ ticket.name }} <span class="status" :class="{ resolved: ticket.status === 'Resuelta' }">{{ ticket.kind }} · {{ ticket.status }}</span></h3><div class="ticket-meta"><span>{{ ticket.location }}</span><span>{{ ticket.date }}</span></div><p>{{ ticket.breed }} · {{ ticket.color }}<br>{{ ticket.note }}</p></div><button class="secondary-button" @click="selectedTicket = ticket">Ver ubicación</button></article><div v-if="!userTickets.length" class="empty-state">Todavía no tienes reportes.</div></div></section>
  <div v-if="selectedTicket" class="modal-backdrop" @click.self="selectedTicket = null"><section class="modal detail-modal"><div class="modal-head"><div><h2>{{ selectedTicket.name }}</h2><p class="modal-intro">Ubicación del reporte · {{ selectedTicket.location }}</p></div><button class="close-button" aria-label="Cerrar" @click="selectedTicket = null">✕</button></div><GoogleMapPicker :latitude="selectedTicket.latitude" :longitude="selectedTicket.longitude" :image-url="selectedTicket.image" :other-markers="otherReportsForMap" :interactive="false" height="360px" /><div class="detail-summary"><span>{{ selectedTicket.kind }}</span><strong>{{ selectedTicket.breed || 'Raza no especificada' }}</strong><small>{{ selectedTicket.note }}</small></div></section></div>
</template>