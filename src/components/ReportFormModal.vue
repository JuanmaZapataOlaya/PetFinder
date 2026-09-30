<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import GoogleMapPicker from '@/components/GoogleMapPicker.vue'
import { breedsByType } from '@/data/tickets'
import { getCurrentUser } from '@/services/authService'
import { generatePetDescription } from '@/services/descriptionService'
import { uploadPetImage } from '@/services/storageService'
import type { PetTicket, PetType, TicketKind } from '@/types'

const props = defineProps<{
  visible: boolean
  editingTicket: PetTicket | null
  initialData?: { type?: PetType; kind?: TicketKind; name?: string; breed?: string; color?: string; description?: string } | null
  otherMarkersForMap: Array<{ latitude: number; longitude: number; image: string; name: string }>
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const defaultImage = 'https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&w=640&q=85'

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

watch(() => [props.editingTicket, props.initialData], () => {
  if (props.editingTicket) {
    const ticket = props.editingTicket
    reportName.value = ticket.name
    reportType.value = ticket.type
    reportKind.value = ticket.kind
    reportLocation.value = ticket.location
    reportColor.value = ticket.color
    reportBreed.value = ticket.breed
    reportNote.value = ticket.note
    imagePreview.value = ticket.image
    imageFile.value = null
    reportLatitude.value = ticket.latitude
    reportLongitude.value = ticket.longitude
  } else if (props.initialData) {
    const init = props.initialData
    reportName.value = init.name || ''
    reportType.value = init.type || 'Perro'
    reportKind.value = init.kind || 'Perdida'
    reportLocation.value = ''
    reportColor.value = init.color || ''
    reportBreed.value = init.breed || ''
    reportNote.value = init.description || ''
    imagePreview.value = ''
    imageFile.value = null
    reportLatitude.value = 19.4326
    reportLongitude.value = -99.1332
  } else {
    reportName.value = ''
    reportType.value = 'Perro'
    reportKind.value = 'Perdida'
    reportLocation.value = ''
    reportColor.value = ''
    reportBreed.value = ''
    reportNote.value = ''
    imagePreview.value = ''
    imageFile.value = null
    reportLatitude.value = 19.4326
    reportLongitude.value = -99.1332
  }
  descriptionError.value = ''
}, { immediate: true, deep: true })

function handleImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const allowedExtensions = new Set(['jpg', 'jpeg', 'heic', 'heif', 'png', 'dng'])
  const extension = file?.name.split('.').pop()?.toLowerCase() || ''
  if (!file) return
  if (!allowedExtensions.has(extension)) {
    descriptionError.value = 'Formato no permitido. Usa únicamente JPG, JPEG, HEIC, HEIF, PNG o DNG.'
    input.value = ''
    return
  }
  if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return
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
  } catch {
    descriptionError.value = 'No se pudo generar la descripción. Intenta de nuevo.'
  } finally {
    isGeneratingDescription.value = false
  }
}

function onLocationChange(location: { latitude: number; longitude: number; address: string }) {
  reportLatitude.value = location.latitude
  reportLongitude.value = location.longitude
  reportLocation.value = location.address
}

async function submit() {
  const currentUser = getCurrentUser()
  if (!currentUser || !reportLocation.value.trim()) return
  const { addTicket, updateTicket } = await import('@/data/tickets')
  const data = {
    name: reportName.value.trim(),
    type: reportType.value,
    kind: reportKind.value,
    location: reportLocation.value.trim(),
    latitude: reportLatitude.value,
    longitude: reportLongitude.value,
    color: reportColor.value.trim(),
    breed: reportBreed.value,
    note: reportNote.value.trim(),
    image: imagePreview.value || defaultImage,
  }
  try {
    const image = imageFile.value ? await uploadPetImage(imageFile.value, currentUser.id) : data.image
    const ticketData = { ...data, image }
    if (props.editingTicket !== null) await updateTicket(props.editingTicket.id, ticketData)
    else await addTicket({ ownerId: currentUser.id, ...ticketData })
  } catch { return }
  emit('saved')
}
</script>

<template>
  <div v-if="visible" class="modal-backdrop" @click.self="emit('close')">
    <form class="modal" @submit.prevent="submit">
      <div class="modal-head">
        <div>
          <h2>{{ editingTicket === null ? 'Reportar una mascota' : 'Editar reporte' }}</h2>
          <p class="modal-intro">Completa los datos de tu reporte.</p>
        </div>
        <button type="button" class="close-button" aria-label="Cerrar" @click="emit('close')">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label for="kind">Tipo de reporte</label>
          <select id="kind" v-model="reportKind">
            <option value="Perdida">Mascota perdida</option>
            <option value="Encontrada">Mascota encontrada</option>
          </select>
        </div>
        <div class="form-field">
          <label for="pet-name">Nombre (opcional)</label>
          <input id="pet-name" v-model="reportName" placeholder="Ej. Luna" />
        </div>
        <div class="form-field">
          <label for="pet-type">Especie</label>
          <select id="pet-type" v-model="reportType">
            <option value="Perro">Perro</option>
            <option value="Gato">Gato</option>
            <option value="Ave">Ave</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
        <div class="form-field">
          <label for="pet-breed">Raza</label>
          <select id="pet-breed" v-model="reportBreed">
            <option value="">Selecciona una raza</option>
            <option v-for="breed in breeds" :key="breed" :value="breed">{{ breed }}</option>
            <option value="Otros">Otros</option>
          </select>
        </div>
        <div class="form-field">
          <label for="pet-color">Color principal</label>
          <input id="pet-color" v-model="reportColor" placeholder="Ej. Canela" />
        </div>
        <div class="form-field">
          <label for="pet-image">Imagen</label>
          <input id="pet-image" type="file" accept=".jpg,.jpeg,.heic,.heif,.png,.dng" @change="handleImage" />
          <small>JPG, JPEG, HEIC, HEIF, PNG o DNG. Máximo 5 MB.</small>
          <p v-if="descriptionError" class="form-error" role="alert">{{ descriptionError }}</p>
        </div>
        <div v-if="imagePreview" class="image-preview full">
          <img :src="imagePreview" alt="Vista previa de la mascota" />
        </div>
        <div class="form-field full">
          <label>Ubicación exacta</label>
          <GoogleMapPicker
            :latitude="reportLatitude"
            :longitude="reportLongitude"
            :image-url="imagePreview"
            :other-markers="otherMarkersForMap"
            height="220px"
            @location-change="onLocationChange"
          />
          <small>Arrastra el marcador para ajustar la ubicación. Navegar por el mapa no lo mueve.</small>
        </div>
        <div class="form-field full">
          <label for="pet-location">Dirección o referencia</label>
          <input id="pet-location" v-model="reportLocation" placeholder="Selecciona un punto o escribe una referencia" required />
        </div>
        <div class="form-field full">
          <div class="description-field-head">
            <label for="pet-note">Descripción</label>
            <button
              type="button"
              class="text-button"
              :disabled="!imagePreview || isGeneratingDescription"
              :title="!imagePreview ? 'Carga una imagen para habilitar esta función.' : ''"
              @click="generateDescription"
            >{{ isGeneratingDescription ? 'Generando...' : 'Generar' }}</button>
          </div>
          <textarea id="pet-note" v-model="reportNote" placeholder="Cuéntanos cómo podemos reconocerla..."></textarea>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary-button" @click="emit('close')">Cancelar</button>
        <button type="submit" class="primary-button">{{ editingTicket === null ? 'Publicar reporte' : 'Guardar cambios' }}</button>
      </div>
    </form>
  </div>
</template>
