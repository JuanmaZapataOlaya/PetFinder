<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Icon from '@/components/Icon.vue'
import GoogleMapPicker from '@/components/GoogleMapPicker.vue'
import { addTicket, breedsByType, removeTicket, tickets as allTickets, updateTicket } from '@/data/tickets'
import { getCurrentUser } from '@/services/authService'
import type { PetTicket, PetType, TicketKind } from '@/types'
import { uploadPetImage } from '@/services/storageService'
import { generatePetDescription } from '@/services/descriptionService'

const defaultImage = 'https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&w=640&q=85'
const activeTab = ref<'Todas' | 'Activas' | 'Resueltas'>('Todas')
const search = ref('')
const showModal = ref(false)
const showToast = ref(false)
const editingTicketId = ref<number | null>(null)
const currentUser = computed(() => getCurrentUser())
const userTickets = computed(() => allTickets.filter((ticket) => ticket.ownerId === currentUser.value?.id))
const filteredTickets = computed(() => userTickets.value.filter((ticket) => {
  const matchesTab = activeTab.value === 'Todas' || (activeTab.value === 'Activas' ? ticket.status === 'Activa' : ticket.status === 'Resuelta')
  const query = search.value.toLowerCase()
  return matchesTab && [ticket.name, ticket.location, ticket.kind, ticket.type, ticket.breed].some((value) => value.toLowerCase().includes(query))
}))

const reportName = ref('')
const reportType = ref<PetType>('Perro')
const reportKind = ref<TicketKind>('Perdida')
const reportLocation = ref('')
const reportColor = ref('')
const reportBreed = ref('')
const reportNote = ref('')
const imagePreview = ref('')
const imageFile = ref<File | null>(null)
const isGeneratingDescription = ref(false)
const descriptionError = ref('')
const reportLatitude = ref(19.4326)
const reportLongitude = ref(-99.1332)
const breeds = computed(() => breedsByType[reportType.value])
const otherReportsForMap = computed(() => allTickets.filter((ticket) => ticket.id !== editingTicketId.value).map((ticket) => ({ latitude: ticket.latitude, longitude: ticket.longitude, image: ticket.image, name: ticket.name })))

function openCreate() {
  editingTicketId.value = null
  reportName.value = ''; reportType.value = 'Perro'; reportKind.value = 'Perdida'; reportLocation.value = ''; reportColor.value = ''; reportBreed.value = ''; reportNote.value = ''; imagePreview.value = ''; imageFile.value = null; reportLatitude.value = 19.4326; reportLongitude.value = -99.1332
  descriptionError.value = ''
  showModal.value = true
}
function editTicket(ticket: PetTicket) {
  editingTicketId.value = ticket.id
  reportName.value = ticket.name; reportType.value = ticket.type; reportKind.value = ticket.kind; reportLocation.value = ticket.location; reportColor.value = ticket.color; reportBreed.value = ticket.breed; reportNote.value = ticket.note; imagePreview.value = ticket.image; imageFile.value = null; reportLatitude.value = ticket.latitude; reportLongitude.value = ticket.longitude
  descriptionError.value = ''
  showModal.value = true
}
async function deleteTicket(id: number) {
  if (!window.confirm('¿Eliminar este reporte? Esta acción no se puede deshacer.')) return
  try { await removeTicket(id) } catch { return }
  showToast.value = true
  window.setTimeout(() => { showToast.value = false }, 3000)
}
function handleImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return
  imageFile.value = file
  descriptionError.value = ''
  const reader = new FileReader()
  reader.onload = () => { imagePreview.value = String(reader.result) }
  reader.readAsDataURL(file)
}
async function generateDescription() {
  if (!imagePreview.value || isGeneratingDescription.value) return
  isGeneratingDescription.value = true
  descriptionError.value = ''
  try {
    reportNote.value = await generatePetDescription({
      image: imagePreview.value,
      type: reportType.value,
      name: reportName.value.trim(),
      breed: reportBreed.value,
      color: reportColor.value.trim(),
      kind: reportKind.value,
    })
    console.log('Descripción generada:', reportNote.value)
  } catch {
    descriptionError.value = 'No se pudo generar la descripción. Intenta de nuevo.'
  } finally {
    isGeneratingDescription.value = false
  }
}
async function submitReport() {
  if (!currentUser.value || !reportLocation.value.trim()) return
  const data = { name: reportName.value.trim(), type: reportType.value, kind: reportKind.value, location: reportLocation.value.trim(), latitude: reportLatitude.value, longitude: reportLongitude.value, color: reportColor.value.trim(), breed: reportBreed.value, note: reportNote.value.trim(), image: imagePreview.value || defaultImage }
  try {
    const image = imageFile.value ? await uploadPetImage(imageFile.value, currentUser.value.id) : data.image
    const ticketData = { ...data, image }
    if (editingTicketId.value !== null) await updateTicket(editingTicketId.value, ticketData)
    else await addTicket({ ownerId: currentUser.value.id, ...ticketData })
  } catch { return }
  showModal.value = false
  showToast.value = true
  window.setTimeout(() => { showToast.value = false }, 3000)
}
function onLocationChange(location: { latitude: number; longitude: number; address: string }) {
  reportLatitude.value = location.latitude
  reportLongitude.value = location.longitude
  reportLocation.value = location.address
}
</script>

<template>
  <section class="content-head"><div class="head-copy"><div class="eyebrow">Viernes, 21 de agosto de 2026</div><h1>Hola, {{ currentUser?.name || 'amigo' }} <span aria-hidden="true">☀</span></h1><p>Un pequeño paso puede llevarlos de vuelta a casa.</p></div><button class="primary-button" @click="openCreate"><Icon name="plus" :size="17" /> Reportar mascota</button></section>
  <section class="stats-grid" aria-label="Resumen de actividad">
    <article class="stat-card"><div class="stat-top"><span>Reportes activos</span><span class="stat-icon"><Icon name="paw" :size="15" /></span></div><div class="stat-number">{{ userTickets.filter((ticket) => ticket.status === 'Activa').length }}</div><span class="stat-note">En seguimiento</span></article>
    <article class="stat-card"><div class="stat-top"><span>Coincidencias</span><span class="stat-icon"><Icon name="heart" :size="15" /></span></div><div class="stat-number">{{ userTickets.filter((ticket) => ticket.match > 0).length }}</div><span class="stat-note">Basadas en tus reportes</span></article>
    <article class="stat-card"><div class="stat-top"><span>Mensajes sin leer</span><span class="stat-icon"><Icon name="message" :size="15" /></span></div><div class="stat-number">0</div><span class="stat-note">Todo al día</span></article>
    <article class="stat-card"><div class="stat-top"><span>Casos resueltos</span><span class="stat-icon"><Icon name="heart" :size="15" /></span></div><div class="stat-number">{{ userTickets.filter((ticket) => ticket.status === 'Resuelta').length }}</div><span class="stat-note">Gracias a la comunidad</span></article>
  </section>
  <div class="workspace">
    <section><div class="section-head"><h2>Mis reportes</h2><RouterLink to="/reportes">Ver todos <Icon name="chevron" :size="13" /></RouterLink></div><div class="tabs"><button v-for="tab in ['Todas', 'Activas', 'Resueltas']" :key="tab" class="tab" :class="{ active: activeTab === tab }" @click="activeTab = tab as typeof activeTab">{{ tab }} <span>({{ tab === 'Todas' ? userTickets.length : userTickets.filter((ticket) => ticket.status === (tab === 'Activas' ? 'Activa' : 'Resuelta')).length }})</span></button></div><div class="ticket-list"><article v-for="ticket in filteredTickets" :key="ticket.id" class="ticket-row"><img class="pet-image" :src="ticket.image" :alt="`Foto de ${ticket.name}`" /><div class="ticket-main"><h3>{{ ticket.name }} <span class="status" :class="{ resolved: ticket.status === 'Resuelta' }">{{ ticket.kind }} · {{ ticket.status }}</span></h3><div class="ticket-meta"><span><Icon name="map" :size="11" /> {{ ticket.location }}</span><span>{{ ticket.date }}</span></div><p>{{ ticket.breed }} · {{ ticket.color }}<br>{{ ticket.note }}</p></div><div class="ticket-tools"><div class="ticket-match"><div class="match-ring">{{ ticket.match }}%</div><span class="match-label">similitud</span></div><button class="text-button" @click="editTicket(ticket)">Editar</button><button class="text-button danger" @click="deleteTicket(ticket.id)">Eliminar</button></div></article><div v-if="filteredTickets.length === 0" class="empty-state">No encontramos reportes para esta cuenta.</div></div></section>
    <aside class="side-panel"><div class="search-box"><Icon name="search" :size="16" /><input v-model="search" type="search" placeholder="Buscar en mis reportes" aria-label="Buscar reportes" /></div><section class="side-section"><div class="section-head"><h3>Coincidencias recientes</h3><RouterLink to="/explorar">Ver todas</RouterLink></div><div v-for="ticket in userTickets.slice(0, 3)" :key="`match-${ticket.id}`" class="match-card"><img :src="ticket.image" :alt="ticket.name" /><div><strong>{{ ticket.name }} · {{ ticket.location.split(' ')[0] }}</strong><small>{{ ticket.timeAgo }} · {{ ticket.type }}</small></div><span class="match-score">{{ ticket.match }}%</span></div></section></aside>
  </div>
  <div v-if="showModal" class="modal-backdrop" @click.self="showModal = false"><form class="modal" @submit.prevent="submitReport"><div class="modal-head"><div><h2>{{ editingTicketId === null ? 'Reportar una mascota' : 'Editar reporte' }}</h2><p class="modal-intro">Completa los datos de tu reporte.</p></div><button type="button" class="close-button" aria-label="Cerrar" @click="showModal = false">✕</button></div><div class="form-grid"><div class="form-field"><label for="kind">Tipo de reporte</label><select id="kind" v-model="reportKind"><option value="Perdida">Mascota perdida</option><option value="Encontrada">Mascota encontrada</option></select></div><div class="form-field"><label for="pet-name">Nombre (opcional)</label><input id="pet-name" v-model="reportName" placeholder="Ej. Luna" /></div><div class="form-field"><label for="pet-type">Especie</label><select id="pet-type" v-model="reportType"><option value="Perro">Perro</option><option value="Gato">Gato</option><option value="Ave">Ave</option><option value="Otro">Otro</option></select></div><div class="form-field"><label for="pet-breed">Raza</label><select id="pet-breed" v-model="reportBreed"><option value="">Selecciona una raza</option><option v-for="breed in breeds" :key="breed" :value="breed">{{ breed }}</option><option value="Otros">Otros</option></select></div><div class="form-field"><label for="pet-color">Color principal</label><input id="pet-color" v-model="reportColor" placeholder="Ej. Canela" /></div><div class="form-field"><label for="pet-image">Imagen</label><input id="pet-image" type="file" accept="image/jpeg,image/png,image/webp" @change="handleImage" /><small>JPG, PNG o WebP. Máximo 5 MB.</small></div><div v-if="imagePreview" class="image-preview full"><img :src="imagePreview" alt="Vista previa de la mascota" /></div><div class="form-field full"><label>Ubicación exacta</label><GoogleMapPicker :latitude="reportLatitude" :longitude="reportLongitude" :image-url="imagePreview" :other-markers="otherReportsForMap" height="220px" @location-change="onLocationChange" /><small>Arrastra el marcador para ajustar la ubicación. Navegar por el mapa no lo mueve.</small></div><div class="form-field full"><label for="pet-location">Dirección o referencia</label><input id="pet-location" v-model="reportLocation" placeholder="Selecciona un punto o escribe una referencia" required /></div><div class="form-field full"><div class="description-field-head"><label for="pet-note">Descripción</label><button type="button" class="text-button" :disabled="!imagePreview || isGeneratingDescription" :title="!imagePreview ? 'Carga una imagen para habilitar esta función.' : ''" @click="generateDescription">{{ isGeneratingDescription ? 'Generando...' : 'Generar' }}</button></div><textarea id="pet-note" v-model="reportNote" placeholder="Cuéntanos cómo podemos reconocerla..."></textarea></div></div><div class="modal-actions"><button type="button" class="secondary-button" @click="showModal = false">Cancelar</button><button type="submit" class="primary-button">{{ editingTicketId === null ? 'Publicar reporte' : 'Guardar cambios' }}</button></div></form></div>
  <div v-if="showToast" class="success-toast">Cambios guardados correctamente.</div>
</template>
