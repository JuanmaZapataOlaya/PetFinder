<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getNotifications, updateNotificationRead } from '@/services/notificationService'
import { getCurrentUser } from '@/services/authService'
import type { AppNotification } from '@/types'

const currentUser = getCurrentUser()
const notifications = ref<AppNotification[]>([])
const loading = ref(true)
const error = ref('')
const defaultPetImage = 'https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&w=320&q=80'

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
    <div class="eyebrow">Actividad</div>
    <h1>Mis notificaciones</h1>
    <p class="page-intro">Revisa las solicitudes y mensajes relacionados con tus reportes.</p>

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
          <p>{{ notification.agentReport }}</p>
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

        </div>
      </article>
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

.notification-analysis p {
  margin: 5px 0 0;
  white-space: pre-line;
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
}
</style>
