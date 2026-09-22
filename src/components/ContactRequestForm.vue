<script setup lang="ts">
import { ref } from 'vue'
import NotificationEvidencePicker from '@/components/NotificationEvidencePicker.vue'
import { getCurrentUser } from '@/services/authService'
import { getContactInfo } from '@/services/contactService'
import { sendContactRequest } from '@/services/notificationService'
import { uploadNotificationEvidence } from '@/services/storageService'
import type { ContactInfo, PetTicket } from '@/types'

const props = defineProps<{
  ticket: PetTicket
}>()

const emit = defineEmits<{
  close: []
}>()

const contactMessage = ref('')
const evidenceFiles = ref<File[]>([])
const contactDataConsent = ref(false)
const sending = ref(false)
const feedback = ref({ text: '', isError: false })

async function submit() {
  const currentUser = getCurrentUser()
  if (!currentUser) {
    feedback.value = { text: 'Debes iniciar sesión para contactar al propietario.', isError: true }
    return
  }
  if (evidenceFiles.value.length !== 2) {
    feedback.value = { text: 'Debes adjuntar exactamente 2 fotografías como evidencia.', isError: true }
    return
  }
  if (!contactDataConsent.value) {
    feedback.value = { text: 'Debes aceptar compartir tus datos de contacto con el propietario.', isError: true }
    return
  }
  sending.value = true
  try {
    const sender: Pick<ContactInfo, 'fullName' | 'phoneNumber' | 'email'> = await getContactInfo(currentUser.id) || {}
    const evidenceImages = await uploadNotificationEvidence(evidenceFiles.value, currentUser.id)
    const result = await sendContactRequest({
      recipientUserId: props.ticket.ownerId,
      senderUserId: currentUser.id,
      reportId: props.ticket.id,
      petImage: props.ticket.image,
      type: 'CONTACT_REQUEST',
      title: 'Nueva solicitud de contacto',
      message: contactMessage.value,
      senderName: sender.fullName || currentUser.name || 'Usuario',
      senderPhone: sender.phoneNumber || 'No especificado',
      senderEmail: sender.email || 'No especificado',
      evidenceImages,
    })
    if (result.success) {
      feedback.value = { text: 'Tu solicitud fue enviada y las evidencias fueron validadas automáticamente.', isError: false }
      emit('close')
    } else {
      feedback.value = { text: result.error || 'Ocurrió un error.', isError: true }
    }
  } catch (error) {
    feedback.value = { text: error instanceof Error ? error.message : 'No se pudieron cargar las fotografías.', isError: true }
  } finally {
    sending.value = false
  }
}

function cancel() {
  contactDataConsent.value = false
  emit('close')
}
</script>

<template>
  <form class="contact-form" @submit.prevent="submit">
    <label for="contact-message">Mensaje (Opcional)</label>
    <textarea
      id="contact-message"
      v-model="contactMessage"
      maxlength="200"
      placeholder="Ej: Hola, creo haber visto a tu mascota..."
    />
    <NotificationEvidencePicker v-model="evidenceFiles" />
    <label class="contact-consent">
      <input v-model="contactDataConsent" type="checkbox" />
      <span>Acepto que mis datos personales de contacto sean compartidos con la persona que publicó este reporte.</span>
    </label>
    <p v-if="feedback.text" class="contact-feedback" :class="{ error: feedback.isError }" :role="feedback.isError ? 'alert' : 'status'" aria-live="polite">
      {{ feedback.text }}
    </p>
    <div class="contact-form-actions">
      <button type="button" class="secondary-button" @click="cancel">Cancelar</button>
      <button type="submit" class="primary-button" :disabled="sending || evidenceFiles.length !== 2 || !contactDataConsent">
        {{ sending ? 'Enviando...' : 'Enviar solicitud' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
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

.contact-consent {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.8rem;
  font-weight: normal;
  line-height: 1.35;
}

.contact-consent input {
  flex: 0 0 auto;
  margin-top: 0.15rem;
}

.contact-feedback {
  margin-top: 0.5rem;
  color: #16a34a;
  font-weight: bold;
  font-size: 0.85rem;
}

.contact-feedback.error {
  color: #dc2626;
}

.contact-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

@media (max-width: 650px) {
  .contact-form-actions {
    flex-direction: column-reverse;
  }

  .contact-form-actions button {
    width: 100%;
    justify-content: center;
  }
}
</style>
