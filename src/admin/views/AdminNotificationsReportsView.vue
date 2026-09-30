<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getReportedNotifications } from '@/services/notificationService'
import type { AppNotification } from '@/types'

const notifications = ref<AppNotification[]>([])
const loading = ref(true)
const error = ref('')
const selectedNotification = ref<AppNotification | null>(null)

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function truncateText(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

async function loadReportedNotifications() {
  try {
    loading.value = true
    error.value = ''
    notifications.value = await getReportedNotifications()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    error.value = `No se pudieron cargar las notificaciones reportadas: ${message}`
    console.error('Error completo:', err)
  } finally {
    loading.value = false
  }
}

onMounted(loadReportedNotifications)
</script>

<template>
  <section class="page-view admin-page section-dashboard">
    <header class="section-heading">
      <div>
        <div class="eyebrow">Panel de administración</div>
        <h1>Notificaciones reportadas</h1>
        <p>Notificaciones marcadas como reportadas por los usuarios.</p>
      </div>
      <button class="reload-button" type="button" @click="loadReportedNotifications" :disabled="loading">
        Actualizar
      </button>
    </header>

    <div v-if="loading" class="section-state">Cargando notificaciones reportadas…</div>

    <div v-else-if="error" class="section-state error-state" role="alert">
      {{ error }}
      <button @click="loadReportedNotifications">Reintentar</button>
    </div>

    <div v-else-if="notifications.length === 0" class="section-state">
      No hay notificaciones reportadas en este momento.
    </div>

    <div v-else class="notifications-table-container">
      <div class="table-scroll">
        <table class="notifications-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Título</th>
              <th>Remitente</th>
              <th>Motivo del reporte</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="notification in notifications" :key="notification.id" class="notification-row">
              <td class="col-id">{{ notification.id }}</td>
              <td class="col-title">
                <div class="title-content">
                  {{ notification.title }}
                  <small v-if="notification.reportId">Reporte #{{ notification.reportId }}</small>
                </div>
              </td>
              <td class="col-sender">{{ notification.senderName || 'No indicado' }}</td>
              <td class="col-reason">
                <span :title="notification.reasonOfReport || 'Sin motivo'">
                  {{ truncateText(notification.reasonOfReport || 'Sin especificar', 60) }}
                </span>
              </td>
              <td class="col-date">{{ formatDate(notification.createdAt) }}</td>
              <td class="col-status">
                <span class="status-badge status-reported">Reportada</span>
              </td>
              <td class="col-action">
                <button class="view-button" type="button" @click="selectedNotification = notification">
                  Ver detalles
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="selectedNotification" class="detail-overlay" role="presentation" @click.self="selectedNotification = null">
      <section class="detail-dialog" role="dialog" aria-modal="true" :aria-label="`Notificación reportada ${selectedNotification.id}`">
        <header>
          <div>
            <div class="eyebrow">Notificación #{{ selectedNotification.id }}</div>
            <h2>{{ selectedNotification.title }}</h2>
          </div>
          <button class="close-button" type="button" aria-label="Cerrar" @click="selectedNotification = null">×</button>
        </header>

        <dl class="detail-list">
          <div>
            <dt>ID de notificación</dt>
            <dd>{{ selectedNotification.id }}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>{{ selectedNotification.type }}</dd>
          </div>
          <div>
            <dt>Remitente</dt>
            <dd>{{ selectedNotification.senderName || 'No indicado' }}</dd>
          </div>
          <div>
            <dt>Receptor</dt>
            <dd>{{ selectedNotification.recipientUserId }}</dd>
          </div>
          <div>
            <dt>Reporte asociado</dt>
            <dd>#{{ selectedNotification.reportId }}</dd>
          </div>
          <div>
            <dt>Fecha de creación</dt>
            <dd>{{ formatDate(selectedNotification.createdAt) }}</dd>
          </div>
          <div>
            <dt>Estado de lectura</dt>
            <dd>{{ selectedNotification.read ? 'Leída' : 'No leída' }}</dd>
          </div>
          <div class="detail-full">
            <dt>Contenido</dt>
            <dd>{{ selectedNotification.message || selectedNotification.title }}</dd>
          </div>
          <div class="detail-full">
            <dt>Motivo del reporte</dt>
            <dd class="reason-text">{{ selectedNotification.reasonOfReport || 'Sin especificar' }}</dd>
          </div>
          <div v-if="selectedNotification.senderPhone">
            <dt>Teléfono del remitente</dt>
            <dd>{{ selectedNotification.senderPhone }}</dd>
          </div>
          <div v-if="selectedNotification.senderEmail">
            <dt>Email del remitente</dt>
            <dd>{{ selectedNotification.senderEmail }}</dd>
          </div>
        </dl>

        <div v-if="selectedNotification.petImage" class="image-section">
          <h3>Imagen de mascota</h3>
          <a :href="selectedNotification.petImage" target="_blank" rel="noopener noreferrer">
            <img :src="selectedNotification.petImage" alt="Imagen de mascota" />
          </a>
        </div>

        <div v-if="selectedNotification.evidenceImages?.length" class="image-section">
          <h3>Evidencias adjuntas ({{ selectedNotification.evidenceImages.length }})</h3>
          <div class="evidence-grid">
            <a
              v-for="(image, index) in selectedNotification.evidenceImages"
              :key="`${selectedNotification.id}-${index}`"
              :href="image.url"
              target="_blank"
              rel="noopener noreferrer"
              class="evidence-item"
            >
              <img :src="image.url" :alt="`Evidencia ${index + 1}`" />
              <span>Ver evidencia {{ index + 1 }}</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.section-dashboard {
  --ink: #314238;
  --muted: #758178;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 20px;
}

.section-heading h1 {
  margin: 4px 0 6px;
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(25px, 3vw, 34px);
}

.section-heading p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.reload-button {
  border: 1px solid #dce5da;
  border-radius: 8px;
  background: white;
  padding: 8px 16px;
  color: #507e55;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.reload-button:hover:not(:disabled) {
  border-color: #507e55;
  background: #f1f8ed;
}

.reload-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.section-state {
  display: grid;
  min-height: 160px;
  place-content: center;
  gap: 10px;
  border: 1px solid #e5ebe3;
  border-radius: 10px;
  background: white;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

.section-state button {
  margin-top: 10px;
  padding: 8px 16px;
  border: 1px solid #dce5da;
  border-radius: 7px;
  background: white;
  color: #507e55;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.error-state {
  color: #a34232;
}

.notifications-table-container {
  background: white;
  border: 1px solid #e2e9df;
  border-radius: 10px;
  overflow: hidden;
}

.table-scroll {
  overflow-x: auto;
}

.notifications-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.notifications-table th {
  background: #f7faf5;
  padding: 12px;
  color: var(--muted);
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid #e2e9df;
}

.notifications-table td {
  padding: 12px;
  border-bottom: 1px solid #edf1ec;
  color: #253b2f;
}

.notification-row:hover {
  background: #f7faf5;
}

.col-id {
  font-family: 'Monaco', monospace;
  font-size: 11px;
  color: #758178;
}

.col-title {
  max-width: 200px;
}

.title-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-wrap: anywhere;
}

.title-content small {
  color: var(--muted);
  font-size: 10px;
}

.col-reason {
  max-width: 200px;
}

.col-reason span {
  display: block;
  overflow-wrap: anywhere;
}

.col-date {
  white-space: nowrap;
}

.col-status {
  text-align: center;
}

.status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.status-reported {
  background: #fff0ed;
  color: #b85d49;
}

.col-action {
  text-align: right;
}

.view-button {
  border: 1px solid #dce5da;
  border-radius: 7px;
  background: white;
  padding: 6px 12px;
  color: #507e55;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.view-button:hover {
  border-color: #507e55;
  background: #f1f8ed;
}

.detail-overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(23, 37, 29, 0.8);
}

.detail-dialog {
  width: min(760px, 100%);
  max-height: min(88vh, 900px);
  overflow-y: auto;
  padding: 22px;
  border-radius: 12px;
  background: white;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.2);
}

.detail-dialog > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 17px;
}

.detail-dialog h2 {
  margin: 5px 0 0;
  color: var(--ink);
}

.eyebrow {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.close-button {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 7px;
  background: #f0f3ef;
  font-size: 24px;
  cursor: pointer;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-button:hover {
  background: #e2e9df;
}

.detail-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 20px;
}

.detail-list > div {
  min-width: 0;
}

.detail-list dt {
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}

.detail-list dd {
  margin: 4px 0 0;
  color: var(--ink);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.detail-full {
  grid-column: 1 / -1;
}

.reason-text {
  background: #f7faf5;
  padding: 10px;
  border-left: 3px solid #e57959;
  border-radius: 4px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.image-section {
  margin-top: 20px;
}

.image-section h3 {
  margin: 0 0 10px;
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
}

.image-section > a {
  display: block;
  max-width: 240px;
}

.image-section img {
  width: 100%;
  max-height: 210px;
  border-radius: 7px;
  background: #f2f4f1;
  object-fit: cover;
}

.evidence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
  gap: 10px;
}

.evidence-item {
  display: grid;
  gap: 6px;
  color: #507e55;
  font-size: 12px;
  text-decoration: none;
}

.evidence-item img {
  width: 100%;
  max-height: 210px;
  border-radius: 7px;
  background: #f2f4f1;
  object-fit: cover;
}

@media (max-width: 700px) {
  .section-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .detail-list {
    grid-template-columns: 1fr;
  }

  .detail-full {
    grid-column: auto;
  }

  .detail-dialog {
    padding: 16px;
  }
}
</style>
