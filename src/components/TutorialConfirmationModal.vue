<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ accept: []; cancel: [] }>()
const yesButton = ref<HTMLButtonElement | null>(null)

watch(() => props.visible, async (visible) => {
  if (!visible) return
  await nextTick()
  yesButton.value?.focus()
}, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="tutorial-confirmation-backdrop" @click.self="emit('cancel')" @keydown.esc="emit('cancel')">
      <section
        class="tutorial-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-confirmation-title"
        aria-describedby="tutorial-confirmation-message"
      >
        <div class="tutorial-confirmation__icon" aria-hidden="true">🐾</div>
        <h2 id="tutorial-confirmation-title">Bienvenido</h2>
        <p id="tutorial-confirmation-message">¿Quieres un recorrido rápido por la aplicación?</p>
        <div class="tutorial-confirmation__actions">
          <button ref="yesButton" type="button" class="primary-button" @click="emit('accept')">Sí</button>
          <button type="button" class="secondary-button" @click="emit('cancel')">No</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.tutorial-confirmation-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(16 37 29 / 68%);
  backdrop-filter: blur(3px);
}

.tutorial-confirmation {
  width: min(100%, 420px);
  border: 1px solid #e2e9df;
  border-radius: 18px;
  padding: 32px;
  background: #fff;
  box-shadow: 0 24px 80px rgb(16 37 29 / 28%);
  text-align: center;
  animation: tutorial-modal-enter 220ms ease-out both;
}

.tutorial-confirmation__icon {
  display: grid;
  width: 54px;
  height: 54px;
  margin: 0 auto 16px;
  place-items: center;
  border-radius: 16px;
  background: #eaf5d7;
  font-size: 26px;
}

.tutorial-confirmation h2 {
  margin: 0;
  color: #173c32;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 25px;
}

.tutorial-confirmation p {
  margin: 10px 0 25px;
  color: #718077;
  font-size: 14px;
  line-height: 1.5;
}

.tutorial-confirmation__actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.tutorial-confirmation__actions button {
  min-width: 104px;
  justify-content: center;
}

@keyframes tutorial-modal-enter {
  from { opacity: 0; transform: translateY(8px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .tutorial-confirmation { animation: none; }
}
</style>
