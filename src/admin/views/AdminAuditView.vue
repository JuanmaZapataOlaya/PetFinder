<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import VChart from 'vue-echarts'
import '@/admin/charts/echarts'
import { supabase } from '@/services/supabase'
import { getAuditLogs } from '@/admin/services/adminApi'

interface AuditRow {
  id: number
  actor_user_id: string | null
  action: string
  target_type: string
  target_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

const pageSize = 100
const offset = ref(0)
const rows = ref<AuditRow[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref('')

async function loadAudit() {
  loading.value = true
  error.value = ''
  try {
    rows.value = (await getAuditLogs(pageSize, offset.value)) as AuditRow[]
    const { count, error: queryError } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
    if (queryError) throw queryError
    total.value = count ?? 0
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo cargar la auditoría.'
    rows.value = []
  } finally {
    loading.value = false
  }
}

const page = computed(() => Math.floor(offset.value / pageSize) + 1)
const actionOption = computed(() => {
  const grouped = new Map<string, number>()
  for (const row of rows.value) grouped.set(row.action, (grouped.get(row.action) ?? 0) + 1)
  const entries = [...grouped.entries()].sort((a, b) => b[1] - a[1])
  return {
    color: ['#5f8fc4'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 40, right: 18, top: 18, bottom: 65, containLabel: true },
    xAxis: { type: 'category', data: entries.map(([action]) => action), axisLabel: { rotate: 25 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{ name: 'Eventos', type: 'bar', data: entries.map(([, amount]) => amount) }],
  }
})
function metadataText(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2)
}
onMounted(loadAudit)
</script>

<template>
  <section class="page-view admin-page section-dashboard">
    <header class="section-heading"><div><div class="eyebrow">Panel de administración</div><h1>Auditoría</h1><p>Registro de acciones administrativas y eventos relevantes de la plataforma.</p></div><button class="refresh-button" type="button" :disabled="loading" @click="loadAudit">Actualizar</button></header>
    <div v-if="loading" class="section-state">Cargando registro de auditoría…</div>
    <div v-else-if="error" class="section-state error-state" role="alert">{{ error }} <button @click="loadAudit">Reintentar</button></div>
    <template v-else>
      <article class="admin-kpi-card audit-total"><div class="admin-kpi-label">Eventos registrados</div><strong>{{ total.toLocaleString('es-CO') }}</strong><p>Registros en audit_logs</p></article>
      <article class="admin-chart-card action-chart"><header><div><h2>Eventos por acción</h2><p>Distribución de la página actual del registro.</p></div></header><VChart v-if="rows.length" class="admin-chart" :option="actionOption" autoresize /><div v-else class="admin-chart-message">No hay eventos registrados.</div></article>
      <article class="admin-chart-card audit-table-card"><header><div><h2>Registro de eventos</h2><p>Acción, actor, destino y metadatos completos.</p></div></header>
        <div v-if="!rows.length" class="admin-chart-message">No hay eventos para mostrar.</div>
        <div v-else class="table-scroll"><table><thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Tipo de destino</th><th>ID de destino</th><th>Metadatos</th></tr></thead><tbody>
          <tr v-for="row in rows" :key="row.id"><td>{{ new Date(row.created_at).toLocaleString('es-CO') }}</td><td>{{ row.actor_user_id || 'Sistema' }}</td><td>{{ row.action }}</td><td>{{ row.target_type }}</td><td>{{ row.target_id || '—' }}</td><td><pre>{{ metadataText(row.metadata) }}</pre></td></tr>
        </tbody></table></div>
        <footer class="pagination"><button type="button" :disabled="offset === 0 || loading" @click="offset -= pageSize; loadAudit()">Anterior</button><span>Página {{ page }} de {{ Math.max(1, Math.ceil(total / pageSize)) }}</span><button type="button" :disabled="offset + pageSize >= total || loading" @click="offset += pageSize; loadAudit()">Siguiente</button></footer>
      </article>
    </template>
  </section>
</template>

<style scoped>
.section-dashboard { --ink:#314238; --muted:#758178; }
.section-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin-bottom:18px; }
.section-heading h1 { margin:4px 0 6px; font-family:'Space Grotesk',sans-serif; font-size:clamp(25px,3vw,34px); }
.section-heading p { margin:0; color:var(--muted); font-size:13px; }
.refresh-button { min-height:36px; padding:0 12px; border:1px solid #dce5da; border-radius:7px; background:white; color:var(--ink); cursor:pointer; }
.refresh-button:disabled { opacity:.6; cursor:wait; }
.audit-total { margin-bottom:15px; }
.action-chart { margin-bottom:15px; }
.action-chart h2,.audit-table-card h2 { margin:0 0 5px; color:var(--ink); font-size:17px; }
.action-chart header p,.audit-table-card header p { margin:0; color:var(--muted); font-size:12px; }
.action-chart .admin-chart { height:260px; }
.table-scroll { overflow:auto; max-height:650px; }
table { width:100%; border-collapse:collapse; font-size:11px; }
th,td { padding:9px; border-bottom:1px solid #edf1ec; text-align:left; vertical-align:top; }
th { position:sticky; top:0; z-index:1; background:white; color:var(--muted); white-space:nowrap; }
pre { max-width:350px; max-height:130px; overflow:auto; margin:0; white-space:pre-wrap; overflow-wrap:anywhere; font:11px/1.4 monospace; }
.pagination { display:flex; align-items:center; justify-content:center; gap:16px; padding-top:14px; color:var(--muted); font-size:12px; }
.pagination button { min-height:34px; padding:0 10px; border:1px solid #dce5da; border-radius:7px; background:white; cursor:pointer; }
.pagination button:disabled { opacity:.45; }
.section-state { display:grid; min-height:160px; place-content:center; gap:10px; border:1px solid #e5ebe3; border-radius:10px; background:white; text-align:center; color:var(--muted); }
.error-state { color:#a34232; }
</style>
