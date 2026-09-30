<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import VChart from 'vue-echarts'
import '@/admin/charts/echarts'
import { getReportsDashboard } from '@/admin/services/adminApi'
import { useAdminQuery } from '@/admin/composables/useAdminQuery'

interface ReportRow {
  id: number
  reason: string
  description: string | null
  evidence_images: string[]
  status: string
  reviewer_notes: string | null
  created_at: string
  resolved_at: string | null
  reporter_id: string | null
  reporter_name: string | null
  reported_user_id: string | null
  reported_user_name: string | null
  ticket_id: number | null
  ticket_name: string | null
  ticket_kind: string | null
  ticket_type: string | null
  ticket_breed: string | null
  ticket_color: string | null
  ticket_status: string | null
  ticket_location: string | null
  ticket_image: string | null
}
interface GroupRow { label: string; total: number }
interface ReportsData { statuses: GroupRow[]; reasons: GroupRow[]; reports: ReportRow[]; total: number }

const period = ref(90)
const selectedReport = ref<ReportRow | null>(null)
const range = computed(() => ({
  p_from: new Date(Date.now() - period.value * 86400000).toISOString(),
  p_to: new Date().toISOString(),
}))

const query = useAdminQuery(() => getReportsDashboard(range.value.p_from, range.value.p_to))
const dashboard = computed(() => query.data.value as ReportsData | null)
const loading = computed(() => query.loading.value)
const error = computed(() => query.error.value)

async function reload() {
  await query.refetch()
}

onMounted(reload)
const statusOption = computed(() => ({
  tooltip: { trigger: 'item' }, legend: { bottom: 0 }, color: ['#d6a344', '#5f8fc4', '#77a661', '#e57959'],
  series: [{ type: 'pie', radius: ['40%', '68%'], data: (dashboard.value?.statuses ?? []).map((row) => ({ name: row.label, value: row.total })) }],
}))
const reasonsOption = computed(() => ({
  color: ['#e57959'],
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 35, right: 18, top: 20, bottom: 58, containLabel: true },
  xAxis: { type: 'category', data: (dashboard.value?.reasons ?? []).map((row) => row.label), axisLabel: { rotate: 20 } },
  yAxis: { type: 'value', minInterval: 1 },
  series: [{ type: 'bar', name: 'Reportes', barMaxWidth: 44, data: (dashboard.value?.reasons ?? []).map((row) => row.total) }],
}))

function labelReason(value: string) {
  return value.replaceAll('_', ' ')
}
</script>

<template>
  <section class="page-view admin-page section-dashboard">
    <header class="section-heading">
      <div><div class="eyebrow">Panel de administración</div><h1>Fraude y reportes</h1><p>Denuncias de usuarios, casos reportados y sus evidencias adjuntas.</p></div>
      <label>Periodo
        <select v-model.number="period" :disabled="loading" @change="reload">
          <option :value="30">30 días</option><option :value="90">90 días</option><option :value="365">12 meses</option>
        </select>
      </label>
    </header>
    <div v-if="loading" class="section-state">Cargando casos y evidencias…</div>
    <div v-else-if="error" class="section-state error-state" role="alert">{{ error }} <button @click="reload">Reintentar</button></div>
    <template v-else-if="dashboard">
      <div class="admin-kpi-grid report-kpis">
        <article class="admin-kpi-card"><div class="admin-kpi-label">Reportes recibidos</div><strong>{{ dashboard.total }}</strong><p>En el periodo seleccionado</p></article>
        <article class="admin-kpi-card"><div class="admin-kpi-label">Pendientes</div><strong>{{ dashboard.statuses.find((row) => row.label === 'pendiente')?.total ?? 0 }}</strong><p>Por revisar</p></article>
        <article class="admin-kpi-card"><div class="admin-kpi-label">En revisión</div><strong>{{ dashboard.statuses.find((row) => row.label === 'en_revision')?.total ?? 0 }}</strong><p>Casos en proceso</p></article>
      </div>
      <div class="section-chart-grid">
        <article class="admin-chart-card"><header><div><h2>Casos por estado</h2><p>Situación de los reportes recibidos</p></div></header><VChart v-if="dashboard.statuses.length" class="admin-chart" :option="statusOption" autoresize /><div v-else class="admin-chart-message">Sin reportes en el periodo.</div></article>
        <article class="admin-chart-card"><header><div><h2>Casos por motivo</h2><p>Motivos indicados por usuarios</p></div></header><VChart v-if="dashboard.reasons.length" class="admin-chart" :option="reasonsOption" autoresize /><div v-else class="admin-chart-message">Sin reportes en el periodo.</div></article>
      </div>
      <article class="admin-chart-card report-list">
        <header><div><h2>Casos reportados</h2><p>Selecciona un caso para ver el reporte completo y sus evidencias.</p></div></header>
        <div v-if="!dashboard.reports.length" class="admin-chart-message">No hay casos reportados para este periodo.</div>
        <div v-else class="table-scroll"><table><thead><tr><th>Fecha</th><th>Motivo</th><th>Usuario reportado</th><th>Mascota / reporte</th><th>Estado</th><th>Evidencias</th><th></th></tr></thead>
          <tbody><tr v-for="report in dashboard.reports" :key="report.id">
            <td>{{ new Date(report.created_at).toLocaleString('es-CO') }}</td><td>{{ labelReason(report.reason) }}</td>
            <td>{{ report.reported_user_name || report.reported_user_id || 'No indicado' }}</td>
            <td>{{ report.ticket_name || 'Sin ticket asociado' }}<small v-if="report.ticket_kind">{{ report.ticket_kind }} · {{ report.ticket_type }}</small></td>
            <td>{{ report.status }}</td><td>{{ report.evidence_images.length }} archivo(s)</td>
            <td><button class="case-button" type="button" @click="selectedReport = report">Ver caso</button></td>
          </tr></tbody>
        </table></div>
      </article>
    </template>

    <div v-if="selectedReport" class="case-overlay" role="presentation" @click.self="selectedReport = null">
      <section class="case-dialog" role="dialog" aria-modal="true" :aria-label="`Caso reportado ${selectedReport.id}`">
        <header><div><div class="eyebrow">Caso #{{ selectedReport.id }}</div><h2>{{ labelReason(selectedReport.reason) }}</h2></div><button class="close-button" type="button" aria-label="Cerrar" @click="selectedReport = null">×</button></header>
        <dl class="case-details">
          <div><dt>Estado</dt><dd>{{ selectedReport.status }}</dd></div>
          <div><dt>Fecha del reporte</dt><dd>{{ new Date(selectedReport.created_at).toLocaleString('es-CO') }}</dd></div>
          <div><dt>Reportado por</dt><dd>{{ selectedReport.reporter_name || selectedReport.reporter_id || 'No disponible' }}</dd></div>
          <div><dt>Usuario reportado</dt><dd>{{ selectedReport.reported_user_name || selectedReport.reported_user_id || 'No indicado' }}</dd></div>
          <div v-if="selectedReport.ticket_id"><dt>Ticket asociado</dt><dd>#{{ selectedReport.ticket_id }} · {{ selectedReport.ticket_name }} ({{ selectedReport.ticket_kind }} / {{ selectedReport.ticket_type }})</dd></div>
          <div v-if="selectedReport.ticket_location"><dt>Ubicación</dt><dd>{{ selectedReport.ticket_location }}</dd></div>
          <div v-if="selectedReport.ticket_breed || selectedReport.ticket_color"><dt>Características</dt><dd>{{ selectedReport.ticket_breed }} · {{ selectedReport.ticket_color }}</dd></div>
          <div class="detail-full"><dt>Descripción</dt><dd>{{ selectedReport.description || 'Sin descripción adicional.' }}</dd></div>
          <div v-if="selectedReport.reviewer_notes" class="detail-full"><dt>Notas de revisión</dt><dd>{{ selectedReport.reviewer_notes }}</dd></div>
        </dl>
        <div v-if="selectedReport.ticket_image" class="evidence-group"><h3>Imagen del reporte</h3><a :href="selectedReport.ticket_image" target="_blank" rel="noopener noreferrer"><img :src="selectedReport.ticket_image" alt="Imagen asociada al reporte" /></a></div>
        <div class="evidence-group"><h3>Evidencias adjuntas ({{ selectedReport.evidence_images.length }})</h3>
          <div v-if="selectedReport.evidence_images.length" class="evidence-grid"><a v-for="(image, index) in selectedReport.evidence_images" :key="`${selectedReport.id}-${index}`" :href="image" target="_blank" rel="noopener noreferrer"><img :src="image" :alt="`Evidencia ${index + 1} del caso ${selectedReport.id}`" /><span>Ver evidencia {{ index + 1 }}</span></a></div>
          <p v-else class="no-evidence">Este reporte no tiene evidencias adjuntas.</p>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.section-dashboard { --ink:#314238; --muted:#758178; }
.section-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin-bottom:20px; }
.section-heading h1 { margin:4px 0 6px; font-family:'Space Grotesk',sans-serif; font-size:clamp(25px,3vw,34px); }
.section-heading p { margin:0; color:var(--muted); font-size:13px; }
.section-heading label { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12px; }
.section-heading select { min-height:38px; border:1px solid #dce5da; border-radius:8px; background:white; padding:0 10px; color:var(--ink); }
.report-kpis { grid-template-columns:repeat(3,minmax(0,1fr)); margin-bottom:16px; }
.section-chart-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:15px; }
.section-chart-grid .admin-chart { height:280px; }
.section-chart-grid h2,.report-list h2 { margin:0 0 5px; color:var(--ink); font-size:17px; }
.section-chart-grid header p,.report-list header p { margin:0; color:var(--muted); font-size:12px; }
.report-list { margin-top:15px; }
.table-scroll { overflow-x:auto; }
table { width:100%; border-collapse:collapse; font-size:12px; }
th,td { padding:10px; border-bottom:1px solid #edf1ec; text-align:left; vertical-align:top; }
th { color:var(--muted); font-weight:600; white-space:nowrap; }
td small { display:block; margin-top:4px; color:var(--muted); }
.case-button { border:1px solid #dce5da; border-radius:7px; background:white; padding:7px 10px; color:#507e55; cursor:pointer; white-space:nowrap; }
.section-state { display:grid; min-height:160px; place-content:center; gap:10px; border:1px solid #e5ebe3; border-radius:10px; background:white; text-align:center; color:var(--muted); }
.error-state { color:#a34232; }
.case-overlay { position:fixed; z-index:1000; inset:0; display:grid; place-items:center; padding:20px; background:#17251dcc; }
.case-dialog { width:min(760px,100%); max-height:min(88vh,900px); overflow-y:auto; padding:22px; border-radius:12px; background:#fff; box-shadow:0 18px 60px #0003; }
.case-dialog > header { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:17px; }
.case-dialog h2 { margin:5px 0 0; color:var(--ink); text-transform:capitalize; }
.close-button { width:34px; height:34px; border:0; border-radius:7px; background:#f0f3ef; font-size:24px; cursor:pointer; }
.case-details { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:0; }
.case-details > div { min-width:0; }
.case-details dt { color:var(--muted); font-size:11px; }
.case-details dd { margin:4px 0 0; color:var(--ink); font-size:13px; overflow-wrap:anywhere; }
.detail-full { grid-column:1/-1; }
.evidence-group { margin-top:20px; }
.evidence-group h3 { margin:0 0 10px; color:var(--ink); font-size:14px; }
.evidence-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(135px,1fr)); gap:10px; }
.evidence-grid a { display:grid; gap:6px; color:#507e55; font-size:12px; }
.evidence-grid img,.evidence-group > a img { width:100%; max-height:210px; border-radius:7px; background:#f2f4f1; object-fit:cover; }
.evidence-group > a { display:block; max-width:240px; }
.no-evidence { color:var(--muted); font-size:13px; }
@media(max-width:700px) { .section-heading { align-items:stretch; flex-direction:column; } .section-chart-grid { grid-template-columns:1fr; } .report-kpis { grid-template-columns:1fr 1fr; } }
@media(max-width:480px) { .report-kpis,.case-details { grid-template-columns:1fr; } .detail-full { grid-column:auto; } .case-dialog { padding:16px; } }
</style>
