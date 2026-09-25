<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getPetHistory } from '@/services/notificationService'
import type { PetHistoryRecord } from '@/types'

const history = ref<PetHistoryRecord[]>([])
const loading = ref(true)
const error = ref('')
const defaultPetImage = 'https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&w=640&q=80'

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(timestamp))
}

function handleImageError(event: Event) {
  const image = event.target as HTMLImageElement
  if (!image.src.endsWith(defaultPetImage)) image.src = defaultPetImage
}

onMounted(async () => {
  try {
    history.value = await getPetHistory()
  } catch {
    error.value = 'No se pudo cargar el historial de mascotas.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="page-view pet-history-view">
    <header class="history-heading" data-tutorial="pet-history">
      <div class="eyebrow">Casos finalizados</div>
      <h1>Historial de mascotas</h1>
      <p class="page-intro">Consulta la actividad y el historial de las mascotas reclamadas por la comunidad a través de la app.</p>
    </header>

    <div v-if="loading" class="history-state" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true" /> Cargando historial...
    </div>
    <div v-else-if="error" class="history-state history-error" role="alert">{{ error }}</div>
    <div v-else-if="!history.length" class="history-state">Todavía no tienes reportes finalizados.</div>

    <div v-else class="history-list">
      <article v-for="record in history" :key="record.id" class="history-card">
        <img class="history-card__image" :src="record.pet.image || defaultPetImage" :alt="`Foto de ${record.pet.name}`" @error="handleImageError" />
        <div class="history-card__body">
          <div class="history-card__heading">
            <div>
              <h2>{{ record.pet.name }}</h2>
              <span class="history-status">Finalizado</span>
            </div>
            <span class="history-report">Reporte #{{ record.reportId }}</span>
          </div>

          <dl class="history-details">
            <div><dt>Especie</dt><dd>{{ record.pet.type }}</dd></div>
            <div><dt>Raza</dt><dd>{{ record.pet.breed || 'No especificada' }}</dd></div>
            <div><dt>Color</dt><dd>{{ record.pet.color || 'No especificado' }}</dd></div>
            <div><dt>Fecha del reporte</dt><dd>{{ record.pet.date }}</dd></div>
            <div><dt>Última ubicación</dt><dd>{{ record.pet.location }}</dd></div>
            <div><dt>Estado del reporte</dt><dd>{{ record.pet.kind }} · {{ record.pet.status }}</dd></div>
          </dl>

          <p class="history-description">{{ record.pet.note || 'Sin descripción disponible.' }}</p>
          <div class="history-users">
            <span><strong>Usuario reportante:</strong> {{ record.reporterName }}</span>
            <span><strong>Usuario receptor:</strong> {{ record.recipientName }}</span>
          </div>
          <small class="history-finished">Caso finalizado el {{ formatDate(record.finalizedAt) }}</small>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.pet-history-view { max-width: 1020px; margin: 0 auto; }
.history-list { display: grid; gap: 18px; }
.history-card { display: grid; grid-template-columns: 190px 1fr; overflow: hidden; border: 1px solid #e2e9df; border-radius: 14px; background: #fff; box-shadow: 0 5px 18px #173c3210; }
.history-card__image { width: 100%; height: 100%; min-height: 250px; object-fit: cover; }
.history-card__body { padding: 22px; }
.history-card__heading { display: flex; justify-content: space-between; gap: 16px; }
.history-card h2 { margin: 0 0 7px; color: #253b2f; font-family: 'Space Grotesk', sans-serif; }
.history-status { display: inline-block; border-radius: 20px; padding: 5px 9px; background: #dcefd5; color: #4d7c42; font-size: 10px; font-weight: 700; }
.history-report, .history-finished { color: #718077; font-size: 11px; }
.history-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; margin: 22px 0 15px; }
.history-details div { display: grid; gap: 3px; }
.history-details dt { color: #718077; font-size: 10px; font-weight: 700; text-transform: uppercase; }
.history-details dd { margin: 0; color: #40564a; font-size: 13px; }
.history-description { color: #526259; font-size: 13px; line-height: 1.55; white-space: pre-line; }
.history-users { display: grid; gap: 6px; margin: 17px 0 13px; border-top: 1px solid #e8eee5; padding-top: 14px; color: #526259; font-size: 12px; }
.history-users strong { color: #253b2f; }
.history-state { display: flex; min-height: 160px; align-items: center; justify-content: center; border: 1px dashed #cbd9c5; border-radius: 12px; color: #849188; font-size: 13px; text-align: center; }
.history-error { border-color: #e4b9ae; background: #fff7f5; color: #b5533e; }
.loading-spinner { width: 16px; height: 16px; margin-right: 8px; border: 2px solid #d6e4d0; border-top-color: #628c4f; border-radius: 50%; animation: history-spin .8s linear infinite; }
@keyframes history-spin { to { transform: rotate(360deg); } }
@media (max-width: 650px) {
  .history-card { grid-template-columns: 1fr; }
  .history-card__image { height: 190px; min-height: 0; }
  .history-details { grid-template-columns: 1fr; }
  .history-card__heading { align-items: flex-start; flex-direction: column; }
}
</style>
