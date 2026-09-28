<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import KpiCard from '@/admin/components/KpiCard.vue'
import { getOverviewKpis } from '@/admin/services/adminApi'
import type { OverviewKpis } from '@/admin/types'
import { useAdminQuery } from '@/admin/composables/useAdminQuery'

const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
const to = new Date().toISOString()
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
        <div class="eyebrow">Panel de administración</div>
        <h1>Resumen</h1>
        <p>Vista general de la plataforma. Abre una sección para consultar sus métricas y registros detallados.</p>
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
    <div v-if="overviewQuery.error.value" class="summary-error" role="alert">
      {{ overviewQuery.error.value }} <button type="button" @click="load">Reintentar</button>
    </div>
    <nav class="section-links" aria-label="Secciones administrativas">
      <RouterLink to="/admin/reclamos"><strong>Tickets y reclamos</strong><span>Actividad, reclamos y características de mascotas</span></RouterLink>
      <RouterLink to="/admin/reportes"><strong>Fraude y reportes</strong><span>Casos reportados por usuarios y evidencias</span></RouterLink>
      <RouterLink to="/admin/costos"><strong>Costos de modelos</strong><span>Consumo de modelos y validaciones</span></RouterLink>
      <RouterLink to="/admin/usuarios"><strong>Usuarios y roles</strong><span>Perfiles, contacto, roles y gestión de cuentas</span></RouterLink>
      <RouterLink to="/admin/auditoria"><strong>Auditoría</strong><span>Registro de acciones y eventos</span></RouterLink>
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