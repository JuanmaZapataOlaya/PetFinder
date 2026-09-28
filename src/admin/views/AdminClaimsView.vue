<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import VChart from 'vue-echarts'
import '@/admin/charts/echarts'
import { getClaimsDashboard } from '@/admin/services/adminApi'
import { useAdminQuery } from '@/admin/composables/useAdminQuery'

interface GroupRow { label: string; total: number; kind?: string }
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
  totals: { tickets: number; claims: number; openClaims: number; notificationsRead: number; notificationsUnread: number }
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

async function reload() {
  await query.refetch()
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
  series: [{ type: 'pie', radius: ['40%', '68%'], data: (query.data.value?.claimStatus ?? []).map((row) => ({ name: row.label, value: row.total })) }],
}))
const readsOption = computed(() => ({
  tooltip: { trigger: 'item' }, legend: { bottom: 0 }, color: ['#77a661', '#e57959'],
  series: [{ type: 'pie', radius: ['40%', '68%'], data: (query.data.value?.notificationReads ?? []).map((row) => ({ name: row.label, value: row.total })) }],
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
        <article class="admin-kpi-card"><div class="admin-kpi-label">Tickets vistos</div><strong>{{ dashboard.totals.notificationsRead }}</strong><p>{{ dashboard.totals.notificationsUnread }} notificaciones sin ver en el periodo</p></article>
      </div>
      <div class="section-chart-grid">
        <article class="admin-chart-card chart-wide"><header><div><h2>Tickets creados y resueltos</h2><p>Evolución diaria según tipo de reporte</p></div></header><VChart v-if="dashboard.ticketTimeline.length" class="admin-chart" :option="timelineOption" autoresize /><div v-else class="admin-chart-message">Sin actividad en este periodo.</div></article>
        <article class="admin-chart-card"><header><div><h2>Estado de tickets</h2><p>Abiertos y resueltos actualmente</p></div></header><VChart v-if="dashboard.ticketStatus.length" class="admin-chart" :option="ticketStatusOption" autoresize /><div v-else class="admin-chart-message">Sin tickets registrados.</div></article>
        <article class="admin-chart-card"><header><div><h2>Estado de reclamos</h2><p>Reclamos de propiedad creados en el periodo</p></div></header><VChart v-if="dashboard.claimStatus.length" class="admin-chart" :option="claimStatusOption" autoresize /><div v-else class="admin-chart-message">Sin reclamos en el periodo.</div></article>
        <article class="admin-chart-card"><header><div><h2>Reportes por ubicación</h2><p>Mascotas perdidas y encontradas</p></div></header><VChart v-if="dashboard.locationStats.length" class="admin-chart" :option="breakdownOption('Tickets', dashboard.locationStats)" autoresize /><div v-else class="admin-chart-message">Sin ubicaciones registradas.</div></article>
        <article class="admin-chart-card"><header><div><h2>Reportes por especie</h2><p>Comparación entre perdidas y encontradas</p></div></header><VChart v-if="dashboard.speciesStats.length" class="admin-chart" :option="breakdownOption('Tickets', dashboard.speciesStats)" autoresize /><div v-else class="admin-chart-message">Sin datos de especies.</div></article>
        <article class="admin-chart-card"><header><div><h2>Reportes por raza</h2><p>Principales razas del periodo</p></div></header><VChart v-if="dashboard.breedStats.length" class="admin-chart" :option="breakdownOption('Tickets', dashboard.breedStats)" autoresize /><div v-else class="admin-chart-message">Sin datos de razas.</div></article>
        <article class="admin-chart-card"><header><div><h2>Notificaciones vistas</h2><p>Estado de lectura de las notificaciones</p></div></header><VChart v-if="dashboard.notificationReads.length" class="admin-chart" :option="readsOption" autoresize /><div v-else class="admin-chart-message">Sin notificaciones en este periodo.</div></article>
      </div>
      <article class="admin-chart-card claims-list"><header><div><h2>Reclamos recibidos</h2><p>Solicitud, ticket asociado y evidencia</p></div></header>
        <div v-if="!dashboard.claims.length" class="admin-chart-message">No hay reclamos en este periodo.</div>
        <div v-else class="table-scroll"><table><thead><tr><th>Fecha</th><th>Reclamante</th><th>Mascota</th><th>Estado</th><th>Similitud</th><th>Evidencia</th></tr></thead><tbody><tr v-for="claim in dashboard.claims" :key="claim.id"><td>{{ new Date(claim.created_at).toLocaleString('es-CO') }}</td><td>{{ claim.claimant_name || claim.claimant_id }}</td><td>{{ claim.ticket_name }} · {{ claim.ticket_kind }} / {{ claim.ticket_type }}<small>{{ claim.ticket_location }}</small></td><td>{{ claim.status }}</td><td>{{ claim.similarity_score === null ? '—' : `${Math.round(claim.similarity_score * 100)}%` }}</td><td><a :href="claim.evidence_image" target="_blank" rel="noopener noreferrer">Ver imagen</a></td></tr></tbody></table></div>
      </article>
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
@media(max-width:800px) { .claims-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:620px) { .section-heading { align-items:stretch; flex-direction:column; } .section-chart-grid { grid-template-columns:minmax(0,1fr); } .chart-wide { grid-column:auto; } .section-chart-grid .admin-chart { height:260px; } }
</style>
