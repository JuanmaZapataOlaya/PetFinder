<script setup lang="ts">
defineProps<{
  title: string
  description: string
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <article class="admin-chart-card">
    <header>
      <div>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
      <button v-if="error" class="text-button danger" type="button" @click="emit('retry')">Reintentar</button>
    </header>
    <div v-if="loading" class="admin-chart-skeleton" aria-label="Cargando gráfica" />
    <div v-else-if="error" class="admin-chart-message">{{ error }}</div>
    <div v-else-if="!$slots.default" class="admin-chart-message">Sin datos en este periodo</div>
    <slot v-else />
  </article>
</template>