<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { marked } from 'marked'
import { finalizeNotification, getNotifications, updateNotificationRead, reportNotification } from '@/services/notificationService'
import { getCurrentUser } from '@/services/authService'
import { useNotificationCommands, type NotificationCommand, type NotificationCommandResult } from '@/composables/useNotificationCommands'
import type { AppNotification } from '@/types'

const currentUser = getCurrentUser()
const notifications = ref<AppNotification[]>([])
const loading = ref(true)
const error = ref('')
const finalizingId = ref<string | null>(null)
const reportingId = ref<string | null>(null)
const reportModalOpen = ref(false)
const reportReason = ref('')
const reportError = ref('')
const reportSuccess = ref(false)
const { pendingCommand, takePendingCommand } = useNotificationCommands()
const defaultPetImage = 'https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&w=320&q=80'

function renderMarkdown(markdown: string): string {
  return marked(markdown) as string
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function notificationDescription(notification: AppNotification): string {
  if (notification.message) return notification.message
  return `${notification.senderName || 'Un usuario'} quiere ponerse en contacto contigo por tu publicación.`
}

function handlePetImageError(event: Event) {
  const image = event.target as HTMLImageElement
  if (image.src.endsWith(defaultPetImage)) return
  image.src = defaultPetImage
}

async function updateReadState(notification: AppNotification, read: boolean) {
  if (!currentUser || notification.read === read) return

  const previousState = notification.read
  notification.read = read
  const result = await updateNotificationRead(currentUser.id, notification.id, read)

  if (!result.success) {
    notification.read = previousState
    error.value = result.error || 'No se pudo actualizar la notificación.'
  }
}

async function saveInHistory(notification: AppNotification) {
  if (!currentUser || finalizingId.value) return
  finalizingId.value = notification.id
  const result = await finalizeNotification(currentUser.id, notification.id)
  if (result.success) {
    notifications.value = notifications.value.filter((item) => item.id !== notification.id)
  } else {
    error.value = result.error || 'No se pudo marcar el reporte como finalizado.'
  }
  finalizingId.value = null
}

function openReportModal(notification: AppNotification) {
  reportingId.value = notification.id
  reportReason.value = ''
  reportError.value = ''
  reportSuccess.value = false
  reportModalOpen.value = true
}

function closeReportModal() {
  reportModalOpen.value = false
  reportingId.value = null
  reportReason.value = ''
  reportError.value = ''
  reportSuccess.value = false
}

function getReasonValidationError(): string {
  if (!reportReason.value || reportReason.value.trim() === '') {
    return 'Por favor ingresa un motivo para reportar esta notificación.'
  }
  return ''
}

async function submitReport() {
  const validationError = getReasonValidationError()
  if (validationError) {
    reportError.value = validationError
    return
  }

  if (!currentUser || !reportingId.value) return

  try {
    reportError.value = ''
    reportSuccess.value = false
    const result = await reportNotification(currentUser.id, reportingId.value, reportReason.value.trim())

    if (result.success) {
      reportSuccess.value = true
      const notification = notifications.value.find(n => n.id === reportingId.value)
      if (notification) {
        notification.reported = true
        notification.reasonOfReport = reportReason.value.trim()
      }
      setTimeout(closeReportModal, 1500)
    } else {
      reportError.value = result.error || 'No se pudo reportar la notificación. Intenta de nuevo.'
    }
  } catch (err) {
    reportError.value = 'Error al reportar la notificación. Intenta de nuevo.'
  }
}

function listNotificationsForAgent(): NotificationCommandResult {
  return {
    status: 'ok',
    message: notifications.value.length ? `Hay ${notifications.value.length} notificaciones.` : 'No hay notificaciones.',
    notifications: notifications.value.map((notification, index) => ({
      position: index + 1,
      title: notification.title,
      sender: notification.senderName || 'Desconocido',
      read: notification.read,
    })),
  }
}

async function runNotificationCommand(command: NotificationCommand): Promise<NotificationCommandResult> {
  if (command.action === 'LIST') return error.value ? { status: 'error', message: error.value } : listNotificationsForAgent()

  const index = (command.position ?? 0) - 1
  const notification = notifications.value[index]
  if (!notification) {
    return { status: 'error', message: `No existe la notificación en la posición ${command.position ?? '(sin indicar)'}.` }
  }

  document.querySelectorAll('.notification-card')[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  error.value = ''
  if (command.action === 'MARK_READ') await updateReadState(notification, true)
  if (command.action === 'MARK_UNREAD') await updateReadState(notification, false)
  if (command.action === 'FINALIZE') await saveInHistory(notification)
  if (command.action === 'REPORT') {
    if (notification.reported) return { status: 'error', message: 'Esa notificación ya fue reportada.' }
    openReportModal(notification)
    if (command.reason) reportReason.value = command.reason
    return { status: 'ok', message: 'Formulario de reporte abierto; el usuario debe revisarlo y pulsar Enviar.' }
  }
  return error.value ? { status: 'error', message: error.value } : { status: 'ok', message: 'Acción realizada.' }
}

watch([pendingCommand, loading], async () => {
  if (loading.value || !pendingCommand.value) return
  const command = takePendingCommand()
  if (!command) return
  await nextTick()
  command.resolve(await runNotificationCommand(command))
}, { immediate: true })

onMounted(async () => {
  try {
    if (currentUser) notifications.value = await getNotifications(currentUser.id)
  } catch {
    error.value = 'No se pudieron cargar las notificaciones.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="page-view notifications-view">
    <header class="notifications-heading" data-tutorial="notifications">
      <div class="eyebrow">Actividad</div>
      <h1>Mis notificaciones</h1>
      <p class="page-intro">Revisa las solicitudes y mensajes relacionados con tus reportes.</p>
    </header>

    <div v-if="loading" class="notifications-state" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" /> Cargando notificaciones...
    </div>

    <div v-else-if="error" class="notifications-state notifications-error" role="alert">
      {{ error }}
    </div>

    <div v-else-if="notifications.length === 0" class="notifications-state">
      No tienes notificaciones recientes.
    </div>

    <div v-else class="notifications-list">
      <article
        v-for="notification in notifications"
        :key="notification.id"
        class="notification-card"
        :class="{ 'notification-card--read': notification.read }"
      >
        <div class="notification-card__pet">
          <img
            :src="notification.petImage || defaultPetImage"
            :alt="`Mascota del reporte ${notification.reportId ? `#${notification.reportId}` : ''}`"
            @error="handlePetImageError"
          />
          <span>Interés en esta mascota</span>
        </div>
        <div class="notification-card__header">
          <div class="notification-card__title">
            <span class="notification-type" aria-hidden="true">●</span>
            <h2>{{ notification.title }}</h2>
          </div>
          <span class="notification-badge" :class="{ 'notification-badge--read': notification.read }">
            {{ notification.read ? 'Leída' : 'No leída' }}
          </span>
        </div>

        <p class="notification-card__description">{{ notificationDescription(notification) }}</p>
        <div v-if="notification.agentReport" class="notification-analysis">
          <strong>Análisis de las fotografías</strong>
          <div v-html="renderMarkdown(notification.agentReport)" class="notification-analysis__content" />
        </div>
        <div v-if="notification.evidenceImages?.length" class="notification-evidence">
          <strong>Evidencia adjunta</strong>
          <div class="notification-evidence__images">
            <a v-for="(image, index) in notification.evidenceImages || []" :key="image.path" :href="image.url" target="_blank" rel="noopener">
              <img :src="image.url" :alt="`Evidencia ${index + 1} de la notificación`" />
            </a>
          </div>
        </div>

        <div class="notification-card__meta">
          <span v-if="notification.senderName"><strong>Remitente:</strong> {{ notification.senderName }}</span>
          <span><strong>Fecha:</strong> {{ formatDate(notification.createdAt) }}</span>
          <span v-if="notification.reportId"><strong>Reporte:</strong> #{{ notification.reportId }}</span>
        </div>

        <div class="notification-card__contact">
          <span v-if="notification.senderPhone"><strong>Teléfono:</strong> {{ notification.senderPhone }}</span>
          <span v-if="notification.senderEmail"><strong>Email:</strong> {{ notification.senderEmail }}</span>
        </div>

        <div class="notification-card__actions">
          <button
            type="button"
            class="primary-button notification-action notification-action--finish"
            :disabled="finalizingId === notification.id"
            @click="saveInHistory(notification)"
          >
            Marcar como finalizado
          </button>
          
          <button
            type="button"
            class="primary-button notification-action"
            :disabled="notification.read"
            @click="updateReadState(notification, true)"
          >
            Marcar como leída
          </button>
          
          <button
            type="button"
            class="secondary-button notification-action"
            :disabled="!notification.read"
            @click="updateReadState(notification, false)"
          >
            Desmarcar
          </button>
          
          <button
            type="button"
            class="danger-button notification-action"
            :disabled="notification.reported"
            @click="openReportModal(notification)"
          >
            {{ notification.reported ? 'Reportada' : 'Reportar' }}
          </button>

        </div>
      </article>
    </div>

    <div v-if="reportModalOpen" class="report-modal-overlay" role="presentation" @click.self="closeReportModal">
      <section class="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
        <header class="report-modal__header">
          <h2 id="report-modal-title">Reportar notificación</h2>
          <button class="report-modal__close" type="button" aria-label="Cerrar" @click="closeReportModal">×</button>
        </header>

        <div class="report-modal__content">
          <label class="report-modal__label">
            <span>Motivo del reporte</span>
            <textarea
              v-model="reportReason"
              class="report-modal__textarea"
              placeholder="Cuéntanos por qué reportas esta notificación..."
              rows="5"
            />
          </label>

          <div v-if="reportError" class="report-modal__error" role="alert">
            {{ reportError }}
          </div>

          <div v-if="reportSuccess" class="report-modal__success" role="status">
            ✓ Notificación reportada correctamente
          </div>
        </div>

        <div class="report-modal__actions">
          <button
            type="button"
            class="secondary-button report-modal__button"
            @click="closeReportModal"
            :disabled="reportSuccess"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="primary-button report-modal__button"
            @click="submitReport"
            :disabled="reportSuccess"
          >
            Enviar
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.notifications-view {
  max-width: 920px;
  margin: 0 auto;
}

.notifications-list {
  display: grid;
  gap: 16px;
}

.notification-card {
  padding: 22px;
  border: 1px solid #e2e9df;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 5px 18px #173c3210;
  transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease, background-color .2s ease;
}

.notification-card:hover {
  border-color: #b8d19d;
  box-shadow: 0 10px 26px #173c3218;
  transform: translateY(-2px);
}

.notification-card--read {
  border-color: #c9ddc0;
  background: #f1f8ed;
}

.notification-card__header,
.notification-card__pet,
.notification-card__title,
.notification-card__meta,
.notification-card__contact,
.notification-card__actions {
  display: flex;
  align-items: center;
}

.notification-card__header {
  justify-content: space-between;
  gap: 16px;
}

.notification-card__pet {
  gap: 13px;
  margin-bottom: 18px;
  color: #6d7e72;
  font-size: 11px;
  font-weight: 700;
}

.notification-card__pet img {
  width: 72px;
  height: 72px;
  flex: 0 0 auto;
  border: 3px solid #edf4e9;
  border-radius: 12px;
  object-fit: cover;
}

.notification-card--read .notification-card__pet img {
  border-color: #d7e8d0;
}

.notification-card__title {
  min-width: 0;
  gap: 10px;
}

.notification-card__title h2 {
  overflow: hidden;
  margin: 0;
  color: #253b2f;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 18px;
  text-overflow: ellipsis;
}

.notification-type {
  flex: 0 0 auto;
  color: #e57959;
  font-size: 11px;
}

.notification-card--read .notification-type {
  color: #6c9b57;
}

.notification-badge {
  flex: 0 0 auto;
  border-radius: 20px;
  padding: 5px 9px;
  background: #fff0ed;
  color: #b85d49;
  font-size: 10px;
  font-weight: 700;
}

.notification-badge--read {
  background: #dcefd5;
  color: #4d7c42;
}

.notification-card__description {
  margin: 16px 0 13px;
  color: #526259;
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.notification-analysis {
  margin: 14px 0;
  border-left: 3px solid #6c9b57;
  padding: 10px 13px;
  background: #f1f8ed;
  color: #40564a;
  font-size: 13px;
  line-height: 1.55;
}

.notification-analysis__content {
  margin: 5px 0 0;
}

.notification-analysis__content p {
  margin: 5px 0;
  line-height: 1.55;
}

.notification-analysis__content ul,
.notification-analysis__content ol {
  margin: 8px 0;
  padding-left: 20px;
}

.notification-analysis__content li {
  margin: 4px 0;
}

.notification-evidence {
  margin: 14px 0;
  color: #40564a;
  font-size: 12px;
}

.notification-evidence__images {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
  max-width: 360px;
}

.notification-evidence__images img {
  width: 100%;
  height: 130px;
  border-radius: 8px;
  object-fit: cover;
}

.notification-card__meta,
.notification-card__contact {
  flex-wrap: wrap;
  gap: 8px 20px;
  color: #718077;
  font-size: 11px;
}

.notification-card__contact {
  margin-top: 9px;
}

.notification-card__meta strong,
.notification-card__contact strong {
  color: #40564a;
}

.notification-card__actions {
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
  border-top: 1px solid #e8eee5;
  padding-top: 16px;
}

.notification-card--read .notification-card__actions {
  border-top-color: #d9e8d3;
}

.notification-action {
  min-width: 145px;
  justify-content: center;
  padding: 9px 12px;
  font-size: 11px;
}

.notification-action:disabled {
  cursor: not-allowed;
  opacity: .45;
  transform: none;
}

/* CLASE NUEVA PARA 'MARCAR COMO FINALIZADO' */
.notification-action--finish {
  background-color: #253b2f;
  color: #ffffff;
  border: 1px solid #253b2f;
  font-weight: bold;
}

.notification-action--finish:hover {
  background-color: #1a2921;
  border-color: #1a2921;
}

.notification-action--delete {
  color: #b5533e;
  border-color: #efd0c8;
}

.notification-confirmation {
  z-index: 10;
}

.notification-confirmation__dialog {
  max-width: 460px;
}

.notification-confirmation__dialog h2 {
  margin: 6px 0 0;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 22px;
}

.notification-confirmation__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.danger-button {
  border: 0;
  border-radius: 7px;
  padding: 10px 15px;
  background: #b85d49;
  color: white;
  font-size: 12px;
  font-weight: 700;
}

.danger-button:hover {
  background: #9f4d3c;
}

.notifications-state {
  display: flex;
  min-height: 160px;
  align-items: center;
  justify-content: center;
  border: 1px dashed #cbd9c5;
  border-radius: 12px;
  color: #849188;
  font-size: 13px;
  text-align: center;
}

.notifications-error {
  border-color: #e4b9ae;
  background: #fff7f5;
  color: #b5533e;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  margin-right: 8px;
  border: 2px solid #d6e4d0;
  border-top-color: #628c4f;
  border-radius: 50%;
  animation: notification-spin .8s linear infinite;
}

@keyframes notification-spin {
  to { transform: rotate(360deg); }
}

.report-modal-overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(23, 37, 29, 0.8);
  animation: fade-in .2s ease;
}

.report-modal {
  width: min(460px, 100%);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  overflow-y: auto;
}

.report-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px;
  border-bottom: 1px solid #e2e9df;
}

.report-modal__header h2 {
  margin: 0;
  color: #253b2f;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 18px;
  font-weight: 600;
}

.report-modal__close {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 7px;
  background: #f0f3ef;
  color: #253b2f;
  font-size: 24px;
  cursor: pointer;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.report-modal__close:hover {
  background: #e2e9df;
}

.report-modal__content {
  padding: 22px;
  flex: 1;
}

.report-modal__label {
  display: block;
  margin-bottom: 16px;
}

.report-modal__label span {
  display: block;
  color: #40564a;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
}

.report-modal__textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cbd9c5;
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  color: #253b2f;
  resize: vertical;
  line-height: 1.5;
}

.report-modal__textarea:focus {
  outline: none;
  border-color: #628c4f;
  box-shadow: 0 0 0 3px rgba(98, 140, 79, 0.1);
}

.report-modal__error {
  margin-top: 12px;
  padding: 10px 12px;
  background: #fff7f5;
  border-left: 3px solid #e57959;
  color: #b5533e;
  font-size: 12px;
  border-radius: 4px;
}

.report-modal__success {
  margin-top: 12px;
  padding: 10px 12px;
  background: #f1f8ed;
  border-left: 3px solid #6c9b57;
  color: #4d7c42;
  font-size: 12px;
  border-radius: 4px;
  font-weight: 600;
}

.report-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 22px;
  border-top: 1px solid #e2e9df;
}

.report-modal__button {
  min-width: 100px;
  padding: 9px 16px;
  font-size: 12px;
  font-weight: 700;
}

.report-modal__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.primary-button {
  border: 0;
  border-radius: 7px;
  padding: 10px 15px;
  background: #628c4f;
  color: white;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background .2s ease;
}

.primary-button:hover:not(:disabled) {
  background: #507e55;
}

.secondary-button {
  border: 1px solid #cbd9c5;
  border-radius: 7px;
  padding: 9px 14px;
  background: white;
  color: #40564a;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color .2s ease, background .2s ease;
}

.secondary-button:hover:not(:disabled) {
  border-color: #628c4f;
  background: #f1f8ed;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (max-width: 650px) {
  .notification-card {
    padding: 17px;
  }

  .notification-card__header {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .notification-badge {
    order: -1;
  }

  .notification-card__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .notification-action {
    width: 100%;
  }

  .notification-confirmation__actions {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .notification-confirmation__actions button {
    width: 100%;
  }

  .report-modal__actions {
    flex-direction: column-reverse;
  }

  .report-modal__button {
    width: 100%;
  }
}
</style>