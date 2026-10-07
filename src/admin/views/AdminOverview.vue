<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import KpiCard from '@/admin/components/KpiCard.vue'
import { getOverviewKpis } from '@/admin/services/adminApi'
import type { OverviewKpis } from '@/admin/types'
import { useAdminQuery } from '@/admin/composables/useAdminQuery'

const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
const to = new Date().toISOString()
const { t } = useI18n()
const overviewQuery = useAdminQuery<OverviewKpis | null>(() => getOverviewKpis(from, to))
const loading = computed(() => overviewQuery.loading.value)
const kpis = computed(() => overviewQuery.data.value)

async function load() {
  await overviewQuery.refetch()
}

onMounted(load)
</script>

<template>
  <section class="page-view admin-page">
    <div class="content-head">
      <div class="head-copy">
        <div class="eyebrow">{{ t('admin.panel') }}</div>
        <h1>{{ t('admin.overview') }}</h1>
        <p>{{ t('admin.overviewIntro') }}</p>
      </div>
    </div>
    <div class="admin-kpi-grid">
      <KpiCard :label="t('admin.activePublications')" :value="kpis?.tickets_activos || 0" :help="t('admin.activePublicationsHelp')" :loading="loading" />
      <KpiCard :label="t('admin.newPublications')" :value="kpis?.tickets_nuevos || 0" :help="t('admin.newPublicationsHelp')" :loading="loading" />
      <KpiCard :label="t('admin.resolvedInPeriod')" :value="kpis?.tickets_resueltos_periodo || 0" :help="t('admin.resolvedInPeriodHelp')" :loading="loading" />
      <KpiCard :label="t('admin.pendingClaims')" :value="kpis?.reclamos_pendientes || 0" :help="t('admin.pendingClaimsHelp')" :loading="loading" />
      <KpiCard :label="t('admin.newUsers')" :value="kpis?.usuarios_nuevos || 0" :help="t('admin.newUsersHelp')" :loading="loading" />
      <KpiCard :label="t('admin.pendingReports')" :value="kpis?.reportes_pendientes || 0" :help="t('admin.pendingReportsHelp')" :loading="loading" />
    </div>
    <div v-if="overviewQuery.error.value" class="summary-error" role="alert">
      {{ overviewQuery.error.value }} <button type="button" @click="load">{{ t('common.retry') }}</button>
    </div>
    <nav class="section-links" :aria-label="t('accessibility.reportedSections')">
      <RouterLink to="/admin/reclamos"><strong>{{ t('admin.ticketsAndClaims') }}</strong><span>{{ t('admin.ticketsAndClaimsHelp') }}</span></RouterLink>
      <RouterLink to="/admin/reportes"><strong>{{ t('navigation.fraudAndReports') }}</strong><span>{{ t('admin.fraudAndReportsHelp') }}</span></RouterLink>
      <RouterLink to="/admin/costos"><strong>{{ t('admin.costsTitle') }}</strong><span>{{ t('admin.modelCostsHelp') }}</span></RouterLink>
      <RouterLink to="/admin/usuarios"><strong>{{ t('admin.usersAndRoles') }}</strong><span>{{ t('admin.usersRolesHelp') }}</span></RouterLink>
      <RouterLink to="/admin/auditoria"><strong>{{ t('admin.audit') }}</strong><span>{{ t('admin.auditHelp') }}</span></RouterLink>
    </nav>
  </section>
</template>

<style scoped>
.section-links { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:22px; }
.section-links a { display:grid; gap:5px; padding:16px; border:1px solid #e5ebe3; border-radius:10px; background:#fff; color:#314238; text-decoration:none; }
.section-links a:hover { border-color:#b7cbb1; box-shadow:0 4px 14px #3142380d; }
.section-links strong { font-family:'Space Grotesk',sans-serif; font-size:15px; }
.section-links span { color:#758178; font-size:12px; }
.summary-error { margin:16px 0; color:#a34232; }
.summary-error button { margin-left:8px; }
@media(max-width:600px) { .section-links { grid-template-columns:1fr; } }
</style>