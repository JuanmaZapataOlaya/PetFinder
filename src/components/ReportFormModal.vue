<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()

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
    descriptionError.value = t('reportForm.invalidImage')
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
    descriptionError.value = t('reportForm.descriptionError')
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
          <h2>{{ t(editingTicket === null ? 'reportForm.createTitle' : 'reportForm.editTitle') }}</h2>
          <p class="modal-intro">{{ t('reportForm.intro') }}</p>
        </div>
        <button type="button" class="close-button" :aria-label="t('common.close')" @click="emit('close')">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-field">
          <label for="kind">{{ t('reportForm.reportType') }}</label>
          <select id="kind" v-model="reportKind">
            <option value="Perdida">{{ t('reportForm.lostPet') }}</option>
            <option value="Encontrada">{{ t('reportForm.foundPet') }}</option>
          </select>
        </div>
        <div class="form-field">
          <label for="pet-name">{{ t('reportForm.petName') }}</label>
          <input id="pet-name" v-model="reportName" :placeholder="t('reportForm.namePlaceholder')" />
        </div>
        <div class="form-field">
          <label for="pet-type">Especie</label>
          <select id="pet-type" v-model="reportType">
            <option value="Perro">{{ t('common.dog') }}</option>
            <option value="Gato">{{ t('common.cat') }}</option>
            <option value="Ave">{{ t('common.bird') }}</option>
            <option value="Otro">{{ t('common.other') }}</option>
          </select>
        </div>
        <div class="form-field">
          <label for="pet-breed">Raza</label>
          <select id="pet-breed" v-model="reportBreed">
            <option value="">{{ t('reportForm.breedPlaceholder') }}</option>
            <option v-for="breed in breeds" :key="breed" :value="breed">{{ breed }}</option>
            <option value="Otros">{{ t('reportForm.otherBreeds') }}</option>
          </select>
        </div>
        <div class="form-field">
          <label for="pet-color">{{ t('reportForm.mainColor') }}</label>
          <input id="pet-color" v-model="reportColor" :placeholder="t('reportForm.colorPlaceholder')" />
        </div>
        <div class="form-field">
          <label for="pet-image">{{ t('reportForm.image') }}</label>
          <input id="pet-image" type="file" accept=".jpg,.jpeg,.heic,.heif,.png,.dng" @change="handleImage" />
          <small>{{ t('reportForm.imageHint') }}</small>
          <p v-if="descriptionError" class="form-error" role="alert">{{ descriptionError }}</p>
        </div>
        <div v-if="imagePreview" class="image-preview full">
          <img :src="imagePreview" :alt="t('reportForm.imagePreview')" />
        </div>
        <div class="form-field full">
          <label>{{ t('reportForm.exactLocation') }}</label>
          <GoogleMapPicker
            :latitude="reportLatitude"
            :longitude="reportLongitude"
            :image-url="imagePreview"
            :other-markers="otherMarkersForMap"
            height="220px"
            @location-change="onLocationChange"
          />
          <small>{{ t('reportForm.mapHint') }}</small>
        </div>
        <div class="form-field full">
          <label for="pet-location">{{ t('reportForm.address') }}</label>
          <input id="pet-location" v-model="reportLocation" :placeholder="t('reportForm.addressPlaceholder')" required />
        </div>
        <div class="form-field full">
          <div class="description-field-head">
            <label for="pet-note">{{ t('reportForm.description') }}</label>
            <button
              type="button"
              class="text-button"
              :disabled="!imagePreview || isGeneratingDescription"
              :title="!imagePreview ? t('reportForm.imageRequired') : ''"
              @click="generateDescription"
            >{{ isGeneratingDescription ? t('common.generated') : t('reportForm.generate') }}</button>
          </div>
          <textarea id="pet-note" v-model="reportNote" :placeholder="t('reportForm.descriptionPlaceholder')"></textarea>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary-button" @click="emit('close')">{{ t('common.cancel') }}</button>
        <button type="submit" class="primary-button">{{ t(editingTicket === null ? 'reportForm.publish' : 'reportForm.saveChanges') }}</button>
      </div>
    </form>
  </div>
</template>
