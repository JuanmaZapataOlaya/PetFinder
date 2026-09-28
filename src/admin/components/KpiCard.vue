<script setup lang="ts">
defineProps<{
  label: string
  value: number | string
  help: string
  loading?: boolean
}>()
</script>

<template>
  <article class="admin-kpi-card">
    <div class="admin-kpi-label">{{ label }}</div>
    <div v-if="loading" class="admin-kpi-skeleton" aria-label="Cargando" />
    <strong v-else>{{ value }}</strong>
    <p>{{ help }}</p>
  </article>
</template>