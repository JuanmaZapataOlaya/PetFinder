<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const sectionTitle = computed(() => String(route.meta.label || 'Administración'))
</script>

<template>
  <section class="page-view admin-page">
    <div class="content-head">
      <div class="head-copy">
        <div class="eyebrow">Panel de administración</div>
        <h1>{{ sectionTitle }}</h1>
        <p>La información administrativa de esta sección aparecerá aquí.</p>
      </div>
    </div>
    <div class="empty-panel">
      <h2>Sección preparada</h2>
      <p>La vista está protegida por roles y lista para conectar sus métricas.</p>
    </div>
  </section>
</template>