<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import VChart from 'vue-echarts'
import '@/admin/charts/echarts'
import type { AppNotification } from '@/types'
import { getFullNotifications } from '@/services/notificationService'
import { getClaimsDashboard } from '@/admin/services/adminApi'
import { useAdminQuery } from '@/admin/composables/useAdminQuery'

interface GroupRow { label: string; total: number; kind?: string; read?: boolean; finalizado?: boolean }
interface TimelineRow { bucket: string; kind: string; created: number; resolved: number }
interface ClaimRow {
  id: number
  status: string
  created_at: string
  reviewed_at: string | null
  evidence_image: string
  similarity_score: number | null
  ticket_id: number
  ticket_name: string
  ticket_type: string
  ticket_kind: string
  ticket_status: string
  ticket_location: string
  claimant_id: string
  claimant_name: string | null
}
interface ClaimsData {
  ticketStatus: GroupRow[]
  ticketTimeline: TimelineRow[]
  locationStats: GroupRow[]
  speciesStats: GroupRow[]
  breedStats: GroupRow[]
  claimStatus: GroupRow[]
  claims: ClaimRow[]
  notificationReads: GroupRow[]
  totals: { 
    tickets: number
    claims: number
    openClaims: number
    notificationsRead: number
    notificationsUnread: number
    notificationsFinalized: number
    notificationsPending: number
  }
}

const period = ref(30)
const range = computed(() => ({
  p_from: new Date(Date.now() - period.value * 86400000).toISOString(),
  p_to: new Date().toISOString(),
}))

const query = useAdminQuery(() => getClaimsDashboard(range.value.p_from, range.value.p_to))
const dashboard = computed(() => query.data.value as ClaimsData | null)
const loading = computed(() => query.loading.value)
const error = computed(() => query.error.value)

const notifications = ref<AppNotification[]>([])
const selectedNotification = ref<AppNotification | null>(null)
const claimsLoading = ref(false)
const claimsError = ref('')

async function reload() {
  await query.refetch()
  await loadReportedNotifications()
}

function truncateText(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

async function loadReportedNotifications() {
  try {
    claimsLoading.value = true
    claimsError.value = ''
    notifications.value = await getFullNotifications()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    claimsError.value = `No se pudieron cargar las notificaciones reportadas: ${message}`
    console.error('Error completo:', err)
  } finally {
    claimsLoading.value = false
  }
}

function formatDate(timestamp: number | string): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp)
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

onMounted(reload)
const chartColor = ['#e57959', '#77a661', '#5f8fc4', '#b37ac8']

function breakdownOption(title: string, rows: GroupRow[]) {
  const labels = [...new Set(rows.map((row) => row.label))]
  const kinds = [...new Set(rows.map((row) => row.kind ?? row.label))]
  const stacked = rows.some((row) => row.kind)
  return {
    color: chartColor,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: stacked ? { bottom: 0 } : undefined,
    grid: { left: 35, right: 18, top: 18, bottom: stacked ? 55 : 35, containLabel: true },
    xAxis: { type: 'category', data: labels, axisLabel: { rotate: labels.length > 6 ? 25 : 0 } },
    yAxis: { type: 'value', minInterval: 1, name: title },
    series: stacked
      ? kinds.map((kind) => ({ name: kind, type: 'bar', stack: 'total', data: labels.map((label) => rows.find((row) => row.label === label && (row.kind ?? row.label) === kind)?.total ?? 0) }))
      : [{ name: title, type: 'bar', data: rows.map((row) => row.total) }],
  }
}

// 1. Función para extraer solo "Ciudad, Departamento"
function getCityAndDepartment(location: string): string {
  if (!location) return 'Desconocida'
  const parts = location.split(',').map((p) => p.trim())
  
  if (parts.length <= 2) return location
  
  const isCountry = parts[parts.length - 1].toLowerCase() === 'colombia'
  const end = isCountry ? parts.length - 1 : parts.length
  const start = Math.max(0, end - 2)
  
  return parts.slice(start, end).join(', ')
}

// 2. Propiedad computada que reduce y agrupa las métricas
const groupedLocationStats = computed(() => {
  if (!dashboard.value?.locationStats) return []
  
  const grouped = new Map<string, GroupRow>()
  
  dashboard.value.locationStats.forEach((row) => {
    const shortLocation = getCityAndDepartment(row.label)
    const key = `${shortLocation}|${row.kind ?? 'all'}`
    
    if (grouped.has(key)) {
      grouped.get(key)!.total += row.total
    } else {
      grouped.set(key, { ...row, label: shortLocation })
    }
  })
  
  return Array.from(grouped.values()).sort((a, b) => b.total - a.total)
})

const timelineOption = computed(() => {
  const rows = dashboard.value?.ticketTimeline ?? []
  const dates = [...new Set(rows.map((row) => row.bucket))].sort()
  const kinds = [...new Set(rows.map((row) => row.kind))]
  return {
    color: chartColor,
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', bottom: 0 },
    grid: { left: 42, right: 18, top: 20, bottom: 55 },
    xAxis: { type: 'category', data: dates },
    yAxis: { type: 'value', minInterval: 1 },
    dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 24, height: 16 }],
    series: kinds.flatMap((kind) => [
      { name: `${kind} creados`, type: 'line', smooth: true, data: dates.map((date) => rows.find((row) => row.bucket === date && row.kind === kind)?.created ?? 0) },
      { name: `${kind} resueltos`, type: 'line', smooth: true, lineStyle: { type: 'dashed' }, data: dates.map((date) => rows.find((row) => row.bucket === date && row.kind === kind)?.resolved ?? 0) },
    ]),
  }
})
const ticketStatusOption = computed(() => ({

  tooltip: { trigger: 'item' }, legend: { bottom: 0 }, color: chartColor,

  series: [{ type: 'pie', radius: ['40%', '68%'], data: (query.data.value?.ticketStatus ?? []).map((row) => ({ name: row.label, value: row.total })) }],

}))
const claimStatusOption = computed(() => ({
  tooltip: { trigger: 'item' }, legend: { bottom: 0 }, color: chartColor,
  series: [{ type: 'pie', radius: ['40%', '68%'], data: (dashboard.value?.claimStatus ?? []).map((row) => ({ name: row.label, value: row.total })) }],
}))

// Gráfico de Notificaciones configurado para desglose por lectura y finalizado
const readsOption = computed(() => ({
  tooltip: { trigger: 'item' }, 
  legend: { bottom: 0 }, 
  color: ['#77a661', '#5f8fc4', '#e57959', '#b37ac8'],
  series: [{ 
    type: 'pie', 
    radius: ['40%', '68%'], 
    data: (query.data.value?.notificationReads ?? []).map((row) => ({ name: row.label, value: row.total })) 
  }],
}))
</script>

<template>
  <section class="page-view admin-page section-dashboard">
    <header class="section-heading">
      <div><div class="eyebrow">Panel de administración</div><h1>Tickets y reclamos</h1><p>Actividad, estado, ubicación y características de los reportes de mascotas.</p></div>
      <label>Periodo
        <select v-model.number="period" :disabled="loading" @change="reload">
          <option :value="7">7 días</option><option :value="30">30 días</option><option :value="90">90 días</option>
        </select>
      </label>
    </header>
    <div v-if="loading" class="section-state">Cargando reclamos y reportes…</div>
    <div v-else-if="error" class="section-state error-state" role="alert">{{ error }} <button @click="reload">Reintentar</button></div>
    <template v-else-if="dashboard">
      <div class="admin-kpi-grid claims-kpis">
        <article class="admin-kpi-card"><div class="admin-kpi-label">Tickets creados</div><strong>{{ dashboard.totals.tickets }}</strong><p>En el periodo</p></article>
        <article class="admin-kpi-card"><div class="admin-kpi-label">Reclamos recibidos</div><strong>{{ dashboard.totals.claims }}</strong><p>En el periodo</p></article>
        <article class="admin-kpi-card"><div class="admin-kpi-label">Reclamos pendientes</div><strong>{{ dashboard.totals.openClaims }}</strong><p>Estado actual</p></article>
        <article class="admin-kpi-card">
          <div class="admin-kpi-label">Notificaciones en el periodo</div>
          <strong>{{ dashboard.totals.notificationsRead }} / {{ dashboard.totals.notificationsRead + dashboard.totals.notificationsUnread }}</strong>
          <p>{{ dashboard.totals.notificationsFinalized }} finalizadas · {{ dashboard.totals.notificationsPending }} pendientes</p>
        </article>
      </div>
      <div class="section-chart-grid">
        <article class="admin-chart-card chart-wide"><header><div><h2>Tickets creados y resueltos</h2><p>Evolución diaria según tipo de reporte</p></div></header><VChart v-if="dashboard.ticketTimeline.length" class="admin-chart" :option="timelineOption" autoresize /><div v-else class="admin-chart-message">Sin actividad en este periodo.</div></article>
        <article class="admin-chart-card"><header><div><h2>Estado de tickets</h2><p>Abiertos y resueltos actualmente</p></div></header><VChart v-if="dashboard.ticketStatus.length" class="admin-chart" :option="ticketStatusOption" autoresize /><div v-else class="admin-chart-message">Sin tickets registrados.</div></article>
        <article class="admin-chart-card"><header><div><h2>Estado de reclamos</h2><p>Reclamos de propiedad creados en el periodo</p></div></header><VChart v-if="dashboard.claimStatus.length" class="admin-chart" :option="claimStatusOption" autoresize /><div v-else class="admin-chart-message">Sin reclamos en el periodo.</div></article>
        <article class="admin-chart-card"><header><div><h2>Reportes por ubicación</h2><p>Mascotas perdidas y encontradas</p></div></header><VChart v-if="groupedLocationStats.length" class="admin-chart" :option="breakdownOption('Tickets', groupedLocationStats)" autoresize /><div v-else class="admin-chart-message">Sin ubicaciones registradas.</div></article>
        <article class="admin-chart-card"><header><div><h2>Reportes por especie</h2><p>Comparación entre perdidas y encontradas</p></div></header><VChart v-if="dashboard.speciesStats.length" class="admin-chart" :option="breakdownOption('Tickets', dashboard.speciesStats)" autoresize /><div v-else class="admin-chart-message">Sin datos de especies.</div></article>
        <article class="admin-chart-card"><header><div><h2>Reportes por raza</h2><p>Principales razas del periodo</p></div></header><VChart v-if="dashboard.breedStats.length" class="admin-chart" :option="breakdownOption('Tickets', dashboard.breedStats)" autoresize /><div v-else class="admin-chart-message">Sin datos de razas.</div></article>
        <article class="admin-chart-card"><header><div><h2>Estado de notificaciones</h2><p>Estado de lectura y finalización</p></div></header><VChart v-if="dashboard.notificationReads.length" class="admin-chart" :option="readsOption" autoresize /><div v-else class="admin-chart-message">Sin notificaciones en este periodo.</div></article>
      </div>
      <article class="admin-chart-card claims-list"><header><div><h2>Lista de reclamos recibidos</h2><p>Todas las notificaciones reportadas de la plataforma</p></div></header>
        <div v-if="claimsLoading" class="section-state">Cargando notificaciones…</div>
        <div v-else-if="claimsError" class="section-state error-state" role="alert">{{ claimsError }} <button @click="loadReportedNotifications">Reintentar</button></div>
        <div v-else-if="!notifications.length" class="admin-chart-message">No hay notificaciones reportadas.</div>
        <div v-else class="table-scroll">
          <table class="claims-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Título</th>
                <th>Remitente</th>
                <th>Contenido</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="notification in notifications" :key="notification.id" class="claim-row">
                <td class="col-id">{{ notification.id}}</td>
                <td class="col-sender">Reporte #{{ notification.reportId }}</td>
                <td class="col-sender">{{ notification.senderName || 'No indicado' }}</td>
                <td class="col-reason">
                  <span :title="notification.message || 'Sin motivo'">
                    {{ truncateText(notification.message || 'Sin especificar', 60) }}
                  </span>
                </td>
                <td class="col-date">{{ formatDate(notification.createdAt) }}</td>
                <td class="col-status">
                  <span class="status-badge">{{ notification.finalizado ? 'Finalizado' : 'En proceso' }}</span>
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
      </article>

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
    </template>
  </section>
</template>

<style scoped>
.section-dashboard { --ink: #314238; --muted: #758178; }
.section-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin-bottom:20px; }
.section-heading h1 { margin:4px 0 6px; font-family:'Space Grotesk',sans-serif; font-size:clamp(25px,3vw,34px); }
.section-heading p { margin:0; color:var(--muted); font-size:13px; }
.section-heading label { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12px; white-space:nowrap; }
.section-heading select { min-height:38px; border:1px solid #dce5da; border-radius:8px; background:white; padding:0 10px; color:var(--ink); }
.claims-kpis { grid-template-columns:repeat(4,minmax(0,1fr)); margin-bottom:18px; }
.section-chart-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:15px; }
.section-chart-grid > article,.claims-list { min-width:0; }
.chart-wide { grid-column:span 2; }
.section-chart-grid .admin-chart { height:290px; }
.section-chart-grid header h2,.claims-list header h2 { margin:0 0 5px; font-size:17px; color:var(--ink); }
.section-chart-grid header p,.claims-list header p { margin:0; color:var(--muted); font-size:12px; }
.section-state { display:grid; min-height:160px; place-content:center; gap:10px; border:1px solid #e5ebe3; border-radius:10px; background:white; text-align:center; color:var(--muted); }
.error-state { color:#a34232; }
.claims-list { margin-top:15px; }
.table-scroll { overflow-x:auto; }
table { width:100%; border-collapse:collapse; font-size:12px; }
th,td { padding:10px; border-bottom:1px solid #edf1ec; text-align:left; vertical-align:top; }
th { color:var(--muted); font-weight:600; white-space:nowrap; }
td small { display:block; margin-top:4px; color:var(--muted); }
a { color:#507e55; }
.claims-table { width:100%; border-collapse:collapse; font-size:12px; }
.claims-table th { background:#f7faf5; padding:12px; color:var(--muted); font-weight:600; text-align:left; border-bottom:1px solid #e2e9df; white-space:nowrap; }
.claims-table td { padding:12px; border-bottom:1px solid #edf1ec; color:#253b2f; }
.claim-row:hover { background:#f7faf5; }
.col-id { font-family:Monaco,monospace; font-size:11px; color:#758178; }
.col-ticket { max-width:200px; }
.col-ticket small { display:block; margin-top:4px; color:var(--muted); font-size:11px; }
.col-date { white-space:nowrap; }
.col-status { text-align:center; }
.status-badge { display:inline-block; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:600; background:#fff0ed; color:#b85d49; }
.view-button { border:1px solid #dce5da; border-radius:7px; background:white; padding:6px 12px; color:#507e55; cursor:pointer; font-size:11px; font-weight:600; white-space:nowrap; transition:border-color .2s ease,background .2s ease; }
.view-button:hover { border-color:#507e55; background:#f1f8ed; }
.detail-overlay { position:fixed; z-index:1000; inset:0; display:grid; place-items:center; padding:20px; background:rgba(23,37,29,.8); }
.detail-dialog { width:min(760px,100%); max-height:min(88vh,900px); overflow-y:auto; padding:22px; border-radius:12px; background:white; box-shadow:0 18px 60px rgba(0,0,0,.2); }
.detail-dialog > header { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:17px; }
.detail-dialog h2 { margin:5px 0 0; color:var(--ink); }
.eyebrow { color:var(--muted); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
.close-button { width:34px; height:34px; border:0; border-radius:7px; background:#f0f3ef; font-size:24px; cursor:pointer; flex:0 0 auto; display:flex; align-items:center; justify-content:center; }
.close-button:hover { background:#e2e9df; }
.detail-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:0 0 20px; }
.detail-list > div { min-width:0; }
.detail-list dt { color:var(--muted); font-size:11px; font-weight:600; }
.detail-list dd { margin:4px 0 0; color:var(--ink); font-size:13px; overflow-wrap:anywhere; }
.detail-full { grid-column:1/-1; }
.section-state button { margin-top:10px; padding:8px 16px; border:1px solid #dce5da; border-radius:7px; background:white; color:#507e55; cursor:pointer; font-size:12px; font-weight:600; }
@media(max-width:800px) { .claims-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:620px) { .section-heading { align-items:stretch; flex-direction:column; } .section-chart-grid { grid-template-columns:minmax(0,1fr); } .chart-wide { grid-column:auto; } .section-chart-grid .admin-chart { height:260px; } .detail-list { grid-template-columns:1fr; } }
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
.col-title {
  max-width: 200px;
}
.col-reason {
  max-width: 200px;
}
.col-reason span {
  display: block;
  overflow-wrap: anywhere;
}
</style>  