<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t } = useI18n()
const sectionTitle = computed(() => String(route.meta.label || t('navigation.administration')))
</script>

<template>
  <section class="page-view admin-page">
    <div class="content-head">
      <div class="head-copy">
        <div class="eyebrow">{{ t('admin.panel') }}</div>
        <h1>{{ sectionTitle }}</h1>
        <p>{{ t('admin.sectionPlaceholder') }}</p>
      </div>
    </div>
    <div class="empty-panel">
      <h2>{{ t('admin.sectionReady') }}</h2>
      <p>{{ t('admin.sectionReadyHelp') }}</p>
    </div>
  </section>
</template>