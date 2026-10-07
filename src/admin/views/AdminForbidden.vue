<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <section class="page-view admin-page">
    <div class="empty-panel">
      <div class="eyebrow">{{ t('admin.panel') }}</div>
      <h1>{{ t('admin.noAccess') }}</h1>
      <p>{{ t('admin.noAccessIntro') }}</p>
    </div>
  </section>
</template>