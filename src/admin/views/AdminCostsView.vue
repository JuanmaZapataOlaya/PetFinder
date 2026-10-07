<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import VChart from 'vue-echarts'
import '@/admin/charts/echarts'
import { getCostsDashboard } from '@/admin/services/adminApi'
import { useAdminQuery } from '@/admin/composables/useAdminQuery'

interface ModelCostRow {
  source: string
  feature: string
  stage: string | null
  provider: string | null
  model: string | null
  input_tokens: number
  output_tokens: number
  cost_usd: number | null
  created_at: string
}
interface ValidationCostRow {
  id: string
  notification_id: string | null
  guard_input_tokens: number | null
  guard_output_tokens: number | null
  guard_cost: number | null
  guardrail_1_input_tokens: number | null
  guardrail_1_output_tokens: number | null
  guardrail_1_cost: number | null
  guardrail_2_input_tokens: number | null
  guardrail_2_output_tokens: number | null
  guardrail_2_cost: number | null
  agent_input_tokens: number | null
  agent_output_tokens: number | null
  agent_cost: number | null
  created_at: string
}
interface CostsData {
  modelCosts: ModelCostRow[]
  claimValidationCosts: ValidationCostRow[]
  summary: { totalUsd: number; modelRows: number; claimValidations: number; claimUsd: number }
}

const period = ref(30)
const { t, locale } = useI18n()
const range = computed(() => ({
  p_from: new Date(Date.now() - period.value * 86400000).toISOString(),
  p_to: new Date().toISOString(),
}))

const query = useAdminQuery(() => getCostsDashboard(range.value.p_from, range.value.p_to))

async function reload() {
  await query.refetch()
}

onMounted(reload)
const currency = computed(() => new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }))

const data = computed(() => query.data.value as CostsData | null)
const loading = computed(() => query.loading.value)
const error = computed(() => query.error.value)

const modelOption = computed(() => {
  const rows = data.value?.modelCosts ?? []
  const grouped = new Map<string, number>()
  for (const row of rows) {
    const label = `${row.provider || t('admin.provider')} · ${row.model || row.stage || t('admin.model')}`
    grouped.set(label, (grouped.get(label) ?? 0) + (Number(row.cost_usd) || 0))
  }
  const entries = [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  return {
    color: ['#5f8fc4'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: number) => currency.value.format(value) },
    grid: { left: 45, right: 18, top: 18, bottom: 75, containLabel: true },
    xAxis: { type: 'category', data: entries.map(([label]) => label), axisLabel: { rotate: 24 } },
    yAxis: { type: 'value', name: 'USD' },
    series: [{ name: t('admin.usdCost'), type: 'bar', barMaxWidth: 42, data: entries.map(([, total]) => total) }],
  }
})

const validationOption = computed(() => {
  const rows = data.value?.claimValidationCosts ?? []
  const sums = [
    { name: 'Guardrail 1', value: rows.reduce((sum, row) => sum + (Number(row.guardrail_1_cost ?? row.guard_cost) || 0), 0) },
    { name: 'Guardrail 2', value: rows.reduce((sum, row) => sum + (Number(row.guardrail_2_cost) || 0), 0) },
    { name: 'Agente', value: rows.reduce((sum, row) => sum + (Number(row.agent_cost) || 0), 0) },
  ]
  return {
    tooltip: { trigger: 'item', formatter: (item: { name: string; value: number; percent: number }) => `${item.name}: ${currency.value.format(item.value)} (${item.percent}%)` },
    legend: { bottom: 0 },
    color: ['#e57959', '#d6a344', '#77a661'],
    series: [{ name: t('admin.validationCost'), type: 'pie', radius: ['40%', '68%'], data: sums }],
  }
})

function tokens(value: number | null) {
  return (value ?? 0).toLocaleString(locale.value)
}
</script>

<template>
  <section class="page-view admin-page section-dashboard">
    <header class="section-heading">
      <div><div class="eyebrow">{{ t('admin.panel') }}</div><h1>{{ t('admin.costsTitle') }}</h1><p>{{ t('admin.costsIntro') }}</p></div>
      <label>{{ t('admin.period') }}
        <select v-model.number="period" :disabled="loading" @change="reload"><option :value="7">{{ t('admin.days7') }}</option><option :value="30">{{ t('admin.days30') }}</option><option :value="90">{{ t('admin.days90') }}</option><option :value="365">{{ t('admin.months12') }}</option></select>
      </label>
    </header>
    <div v-if="loading" class="section-state">{{ t('admin.loadingCosts') }}</div>
    <div v-else-if="error" class="section-state error-state" role="alert">{{ error }} <button @click="reload">{{ t('common.retry') }}</button></div>
    <template v-else-if="data">
      <div class="admin-kpi-grid cost-kpis">
        <article class="admin-kpi-card"><div class="admin-kpi-label">{{ t('admin.modelCost') }}</div><strong>{{ currency.format(Number(data.summary.totalUsd)) }}</strong><p>{{ data.summary.modelRows }} {{ t('admin.modelRows') }}</p></article>
        <article class="admin-kpi-card"><div class="admin-kpi-label">{{ t('admin.validation') }}</div><strong>{{ data.summary.claimValidations }}</strong><p>{{ t('admin.validationRows') }}</p></article>
        <article class="admin-kpi-card"><div class="admin-kpi-label">{{ t('admin.validationCost') }}</div><strong>{{ currency.format(Number(data.summary.claimUsd)) }}</strong><p>{{ t('admin.guardrailsAgent') }}</p></article>
      </div>
      <div class="section-chart-grid">
        <article class="admin-chart-card"><header><div><h2>{{ t('admin.modelProviderCost') }}</h2><p>{{ t('admin.topCosts') }}</p></div></header><VChart v-if="data.modelCosts.length" class="admin-chart" :option="modelOption" autoresize /><div v-else class="admin-chart-message">{{ t('admin.noModelCosts') }}</div></article>
        <article class="admin-chart-card"><header><div><h2>{{ t('admin.validationBreakdown') }}</h2><p>{{ t('admin.guardrailsAgent') }}</p></div></header><VChart v-if="data.claimValidationCosts.length" class="admin-chart" :option="validationOption" autoresize /><div v-else class="admin-chart-message">{{ t('admin.noValidationCosts') }}</div></article>
      </div>

      <article class="admin-chart-card data-table"><header><div><h2>admin_model_costs_rows</h2><p>{{ t('admin.modelRowsIntro') }}</p></div></header>
        <div v-if="!data.modelCosts.length" class="admin-chart-message">{{ t('admin.noPeriodRecords') }}</div>
        <div v-else class="table-scroll"><table><thead><tr><th>{{ t('admin.date') }}</th><th>{{ t('admin.source') }}</th><th>{{ t('admin.feature') }}</th><th>{{ t('admin.stage') }}</th><th>{{ t('admin.provider') }}</th><th>{{ t('admin.model') }}</th><th>{{ t('admin.inputTokens') }}</th><th>{{ t('admin.outputTokens') }}</th><th>{{ t('admin.usdCost') }}</th></tr></thead><tbody>
          <tr v-for="(row, index) in data.modelCosts" :key="`${row.source}-${index}`"><td>{{ new Date(row.created_at).toLocaleString(locale) }}</td><td>{{ row.source }}</td><td>{{ row.feature }}</td><td>{{ row.stage || '—' }}</td><td>{{ row.provider || '—' }}</td><td>{{ row.model || '—' }}</td><td>{{ tokens(row.input_tokens) }}</td><td>{{ tokens(row.output_tokens) }}</td><td>{{ row.cost_usd === null ? t('admin.noRate') : currency.format(Number(row.cost_usd)) }}</td></tr>
        </tbody></table></div>
      </article>

      <article class="admin-chart-card data-table"><header><div><h2>claim_validation_costs</h2><p>{{ t('admin.validationRowsIntro') }}</p></div></header>
        <div v-if="!data.claimValidationCosts.length" class="admin-chart-message">{{ t('admin.noPeriodRecords') }}</div>
        <div v-else class="table-scroll"><table><thead><tr><th>{{ t('admin.date') }}</th><th>ID</th><th>{{ t('admin.notification') }}</th><th>{{ t('admin.guardInput') }}</th><th>{{ t('admin.guardOutput') }}</th><th>{{ t('admin.guardUsd') }}</th><th>{{ t('admin.guardrail1Usd') }}</th><th>{{ t('admin.guardrail2Usd') }}</th><th>{{ t('admin.agentInput') }}</th><th>{{ t('admin.agentOutput') }}</th><th>{{ t('admin.agentUsd') }}</th></tr></thead><tbody>
          <tr v-for="row in data.claimValidationCosts" :key="row.id"><td>{{ new Date(row.created_at).toLocaleString(locale) }}</td><td>{{ row.id }}</td><td>{{ row.notification_id || '—' }}</td><td>{{ tokens(row.guard_input_tokens) }}</td><td>{{ tokens(row.guard_output_tokens) }}</td><td>{{ currency.format(Number(row.guard_cost) || 0) }}</td><td>{{ currency.format(Number(row.guardrail_1_cost) || 0) }}</td><td>{{ currency.format(Number(row.guardrail_2_cost) || 0) }}</td><td>{{ tokens(row.agent_input_tokens) }}</td><td>{{ tokens(row.agent_output_tokens) }}</td><td>{{ currency.format(Number(row.agent_cost) || 0) }}</td></tr>
        </tbody></table></div>
      </article>
    </template>
  </section>
</template>

<style scoped>
.section-dashboard { --ink:#314238; --muted:#758178; }
.section-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin-bottom:20px; }
.section-heading h1 { margin:4px 0 6px; font-family:'Space Grotesk',sans-serif; font-size:clamp(25px,3vw,34px); }
.section-heading p { margin:0; color:var(--muted); font-size:13px; }
.section-heading label { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12px; }
.section-heading select { min-height:38px; border:1px solid #dce5da; border-radius:8px; background:white; padding:0 10px; color:var(--ink); }
.cost-kpis { grid-template-columns:repeat(3,minmax(0,1fr)); margin-bottom:15px; }
.section-chart-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:15px; }
.section-chart-grid .admin-chart { height:290px; }
.section-chart-grid h2,.data-table h2 { margin:0 0 5px; color:var(--ink); font-size:17px; }
.section-chart-grid header p,.data-table header p { margin:0; color:var(--muted); font-size:12px; }
.data-table { margin-top:15px; }
.table-scroll { overflow:auto; max-height:540px; }
table { width:100%; border-collapse:collapse; font-size:11px; white-space:nowrap; }
th,td { padding:9px; border-bottom:1px solid #edf1ec; text-align:left; }
th { position:sticky; top:0; z-index:1; background:#fff; color:var(--muted); }
.section-state { display:grid; min-height:160px; place-content:center; gap:10px; border:1px solid #e5ebe3; border-radius:10px; background:white; text-align:center; color:var(--muted); }
.error-state { color:#a34232; }
@media(max-width:650px) { .section-heading { align-items:stretch; flex-direction:column; } .section-chart-grid { grid-template-columns:1fr; } .cost-kpis { grid-template-columns:1fr; } .section-chart-grid .admin-chart { height:260px; } }
</style>
