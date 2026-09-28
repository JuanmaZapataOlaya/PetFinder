<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import VChart from 'vue-echarts'
import '@/admin/charts/echarts'
import KpiCard from '@/admin/components/KpiCard.vue'
import ChartCard from '@/admin/components/ChartCard.vue'
import { getOverviewKpis, getTicketsTimeseries } from '@/admin/services/adminApi'
import type { OverviewKpis, TicketsTimeseriesRow } from '@/admin/types'
import { useAdminQuery } from '@/admin/composables/useAdminQuery'

const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
const to = new Date().toISOString()
const overviewQuery = useAdminQuery<OverviewKpis | null>(() => getOverviewKpis(from, to))
const timeseriesQuery = useAdminQuery<TicketsTimeseriesRow[]>(() => getTicketsTimeseries(from, to))
const loading = computed(() => overviewQuery.loading.value || timeseriesQuery.loading.value)
const error = computed(() => overviewQuery.error.value || timeseriesQuery.error.value)
const kpis = computed(() => overviewQuery.data.value)
const timeseries = computed(() => timeseriesQuery.data.value || [])

const chartOption = computed(() => {
  const dates = [...new Set(timeseries.value.map((row) => row.bucket))]
  return {
    color: ['#e57959', '#77a661'],
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 40, right: 20, top: 20, bottom: 45 },
    xAxis: { type: 'category', data: dates },
    yAxis: { type: 'value', minInterval: 1 },
    series: ['Perdida', 'Encontrada'].map((kind) => ({
      name: kind,
      type: 'line',
      smooth: true,
      data: dates.map((date) => timeseries.value.find((row) => row.bucket === date && row.kind === kind)?.total || 0),
    })),
  }
})

async function load() {
  await Promise.all([overviewQuery.refetch(), timeseriesQuery.refetch()])
}

onMounted(load)
</script>

<template>
  <section class="page-view admin-page">
    <div class="content-head">
      <div class="head-copy">
        <div class="eyebrow">Panel de administración</div>
        <h1>Resumen</h1>
        <p>Indicadores de los últimos 30 días y estado actual de la plataforma.</p>
      </div>
    </div>
    <div class="admin-kpi-grid">
      <KpiCard label="Publicaciones activas" :value="kpis?.tickets_activos || 0" help="Publicaciones con estado Activa actualmente." :loading="loading" />
      <KpiCard label="Nuevas publicaciones" :value="kpis?.tickets_nuevos || 0" help="Publicaciones creadas dentro del periodo seleccionado." :loading="loading" />
      <KpiCard label="Resueltas en periodo" :value="kpis?.tickets_resueltos_periodo || 0" help="Publicaciones cuyo resolved_at cae dentro del periodo." :loading="loading" />
      <KpiCard label="Reclamos pendientes" :value="kpis?.reclamos_pendientes || 0" help="Reclamos que siguen en estado pendiente." :loading="loading" />
      <KpiCard label="Usuarios nuevos" :value="kpis?.usuarios_nuevos || 0" help="Perfiles creados dentro del periodo seleccionado." :loading="loading" />
      <KpiCard label="Denuncias pendientes" :value="kpis?.reportes_pendientes || 0" help="Denuncias que aún no han sido revisadas." :loading="loading" />
    </div>
    <ChartCard title="Nuevas publicaciones" description="Comparación entre mascotas perdidas y encontradas." :loading="loading" :error="error" @retry="load">
      <VChart v-if="timeseries.length" class="admin-chart" :option="chartOption" autoresize />
      <div v-else class="admin-chart-message">Sin datos en este periodo</div>
    </ChartCard>
  </section>
</template>