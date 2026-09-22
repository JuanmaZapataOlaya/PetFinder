<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { AUTH_STATE_CHANGED_EVENT, getCurrentUser } from '@/services/authService'
import { executeAgentAction, sendAgentMessage, startAgentSession, type AgentAction } from '@/services/agentService'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface TutorialStep {
  title: string
  description: string
}

const router = useRouter()
const isChatOpen = ref(false)
const draftMessage = ref('')
const agentSessionId = ref<string | null>(null)
const isAgentLoading = ref(false)
const agentError = ref('')
const showTutorial = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)
const proactiveMessage = ref('')

const tutorialSteps: TutorialStep[] = [
  { title: 'Busca mascotas', description: 'Encuentra reportes usando la especie, raza, color y otras características.' },
  { title: 'Crea un reporte', description: 'Publica una mascota perdida o encontrada con sus datos y ubicación.' },
  { title: 'Revisa coincidencias', description: 'Explora reportes y posibles coincidencias para contactar a la comunidad.' },
  { title: 'Gestiona tus reportes', description: 'Consulta, edita y revisa el estado de los reportes de tu cuenta.' },
]

const proactiveMessages = [
  'Guau, guau... ¿necesitas ayuda con algo?',
  '¿Buscas a tu mascota? Mi olfato es muy agudo, quizas pueda encontrarla',
  '¡Grrr! No dejes que la interfaz te confunda, yo te guío sin morder.',
  'Auuuu... Siento que hay notificaciones recientes que deberías ver.',
]

const chatMessages = ref<ChatMessage[]>([
  { id: 1, role: 'assistant', content: '¡Hola! Soy tu asistente virtual de PetFinder.', timestamp: new Date() },
  { id: 2, role: 'assistant', content: 'Puedo orientarte sobre reportes, mascotas y el uso de la plataforma.', timestamp: new Date() },
])

let nextMessageId = 3
let proactiveMessageIndex = 0
let proactiveMessageTimer: ReturnType<typeof setInterval> | undefined
let proactiveMessageHideTimer: ReturnType<typeof setTimeout> | undefined

async function initSession() {
  const user = getCurrentUser()
  if (!user) return
  agentSessionId.value = null
  try {
    agentSessionId.value = await startAgentSession(user.id)
  } catch {
    agentError.value = 'No fue posible conectar el asistente. Intenta de nuevo más tarde.'
  }
}

function toggleChat() {
  isChatOpen.value = !isChatOpen.value
}

function closeChat() {
  isChatOpen.value = false
}

function showNextProactiveMessage() {
  if (isChatOpen.value) return
  const nextMessage = proactiveMessages[proactiveMessageIndex]
  if (!nextMessage) return
  proactiveMessage.value = nextMessage
  proactiveMessageIndex = (proactiveMessageIndex + 1) % proactiveMessages.length
  if (proactiveMessageHideTimer) clearTimeout(proactiveMessageHideTimer)
  proactiveMessageHideTimer = setTimeout(() => { proactiveMessage.value = '' }, 5000)
}

function formatMessageTime(timestamp: Date) {
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

function handleMessageKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

async function sendMessage() {
  const content = draftMessage.value.trim()
  if (!content || isAgentLoading.value) return

  const message: ChatMessage = { id: nextMessageId++, role: 'user', content, timestamp: new Date() }
  chatMessages.value.push(message)
  draftMessage.value = ''
  isAgentLoading.value = true
  agentError.value = ''
  try {
    if (!agentSessionId.value) {
      const user = getCurrentUser()
      if (user) agentSessionId.value = await startAgentSession(user.id)
    }
    if (!agentSessionId.value) throw new Error('No hay una sesión activa del asistente.')
    const response = await sendAgentMessage(agentSessionId.value, content)
    addAssistantMessage(response.message)
    handleAgentAction(response.action, response.payload)
  } catch (error) {
    agentError.value = error instanceof Error ? error.message : 'No fue posible obtener una respuesta del asistente.'
    addAssistantMessage(agentError.value)
  } finally {
    isAgentLoading.value = false
  }
}

function handleAgentAction(action: AgentAction | null, payload: Record<string, unknown>) {
  const result = executeAgentAction({ action, payload })
  if (!result) return
  if (result.type === 'RUN_TUTORIAL') {
    showTutorial.value = true
    return
  }
  if (result.type === 'FIND_PET') {
    const query = typeof result.params.query_description === 'string' ? result.params.query_description : ''
    void router.push({ name: 'explore', query: { q: query } })
    return
  }
  const reportType = result.params.type === 'FOUND' ? 'Encontrada' : 'Perdida'
  const reportKind = result.params.kind === 'CAT' ? 'Gato' : result.params.kind === 'OTHER' ? 'Otro' : 'Perro'
  void router.push({
    name: 'summary',
    query: {
      action: 'create',
      type: reportKind,
      kind: reportType,
      breed: typeof result.params.breed === 'string' ? result.params.breed : '',
      color: typeof result.params.color === 'string' ? result.params.color : '',
      description: typeof result.params.description === 'string' ? result.params.description : '',
    },
  })
}

function addAssistantMessage(content: string) {
  const normalizedContent = content.trim()
  if (!normalizedContent) return
  chatMessages.value.push({ id: nextMessageId++, role: 'assistant', content: normalizedContent, timestamp: new Date() })
}

async function scrollMessagesToEnd() {
  await nextTick()
  if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
}

watch(chatMessages, scrollMessagesToEnd, { deep: true })
defineExpose({ addAssistantMessage })

onMounted(() => {
  window.addEventListener(AUTH_STATE_CHANGED_EVENT, initSession)
  window.addEventListener('storage', initSession)
  void initSession()
  proactiveMessageTimer = setInterval(showNextProactiveMessage, 14000)
  proactiveMessageHideTimer = setTimeout(showNextProactiveMessage, 1000)
})

onBeforeUnmount(() => {
  window.removeEventListener(AUTH_STATE_CHANGED_EVENT, initSession)
  window.removeEventListener('storage', initSession)
  if (proactiveMessageTimer) clearInterval(proactiveMessageTimer)
  if (proactiveMessageHideTimer) clearTimeout(proactiveMessageHideTimer)
})
</script>

<template>
  <Transition name="proactive-message">
    <button v-if="!isChatOpen && proactiveMessage" type="button" class="proactive-message" aria-label="Abrir asistente virtual" @click="toggleChat">
      {{ proactiveMessage }}
    </button>
  </Transition>
  <button v-if="!isChatOpen" type="button" class="chat-launcher" aria-label="Abrir asistente virtual" @click="toggleChat">
    <img src="/media/LogoAgente.png" alt="" />
  </button>
  <section v-else class="chat-window" aria-label="Asistente Virtual">
    <header class="chat-header">
      <div class="chat-agent">
        <img src="/media/LogoAgente.png" alt="" />
        <div><strong>Asistente Virtual</strong><span><i /> En línea</span></div>
      </div>
      <button type="button" class="chat-close" aria-label="Cerrar asistente virtual" @click="closeChat">×</button>
    </header>
    <div ref="messagesContainer" class="chat-messages" role="log" aria-live="polite">
      <div v-for="message in chatMessages" :key="message.id" class="chat-message" :class="`chat-message--${message.role}`">
        <div class="chat-bubble">
          <p>{{ message.content }}</p>
          <time :datetime="message.timestamp.toISOString()">{{ formatMessageTime(message.timestamp) }}</time>
        </div>
        <p v-if="isAgentLoading" class="chat-status" aria-live="polite">El asistente está escribiendo...</p>
        <p v-if="agentError && !isAgentLoading" class="chat-status chat-status--error" role="alert">{{ agentError }}</p>
      </div>
    </div>
    <form class="chat-composer" @submit.prevent="sendMessage">
      <textarea v-model="draftMessage" rows="1" aria-label="Escribe tu mensaje" placeholder="Escribe tu mensaje..." @keydown="handleMessageKeydown" />
      <button type="submit" aria-label="Enviar mensaje" :disabled="!draftMessage.trim()">➤</button>
      <small>Enter para enviar · Shift + Enter para una nueva línea</small>
    </form>
  </section>
  <div v-if="showTutorial" class="modal-backdrop" @click.self="showTutorial = false">
    <section class="modal tutorial-modal" aria-labelledby="tutorial-title">
      <div class="modal-head">
        <div>
          <div class="eyebrow">Guía rápida</div>
          <h2 id="tutorial-title">Conoce FindMyPet</h2>
        </div>
        <button type="button" class="close-button" aria-label="Cerrar tutorial" @click="showTutorial = false">Cerrar</button>
      </div>
      <div class="tutorial-steps">
        <article v-for="(step, index) in tutorialSteps" :key="step.title" class="tutorial-step">
          <span>{{ index + 1 }}</span>
          <div><h3>{{ step.title }}</h3><p>{{ step.description }}</p></div>
        </article>
      </div>
      <div class="modal-actions">
        <button type="button" class="primary-button" @click="showTutorial = false">Empezar a explorar</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.chat-launcher {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 20;
  width: 68px;
  height: 68px;
  padding: 8px;
  border: 0;
  border-radius: 50%;
  background: #d9f28f;
  box-shadow: 0 8px 24px #173c3240, 0 0 0 5px #ffffffc9;
  transition: transform .2s ease, box-shadow .2s ease;
}

.proactive-message {
  position: fixed;
  right: 108px;
  bottom: 38px;
  z-index: 20;
  max-width: 235px;
  border: 1px solid #dce7d8;
  border-radius: 14px 14px 3px 14px;
  padding: 11px 14px;
  background: white;
  color: #304238;
  box-shadow: 0 7px 22px #173c3226;
  font-size: 12px;
  line-height: 1.35;
  text-align: left;
  transform-origin: right center;
}

.proactive-message::after {
  content: '';
  position: absolute;
  right: -7px;
  bottom: 14px;
  width: 12px;
  height: 12px;
  border-top: 1px solid #dce7d8;
  border-right: 1px solid #dce7d8;
  background: white;
  transform: rotate(45deg);
}

.proactive-message-enter-active,
.proactive-message-leave-active {
  transition: opacity .3s ease, transform .3s ease;
}

.proactive-message-enter-from,
.proactive-message-leave-to {
  opacity: 0;
  transform: translateY(5px) scale(.96);
}

.chat-launcher:hover { transform: translateY(-4px) scale(1.04); box-shadow: 0 13px 30px #173c3252, 0 0 0 5px #ffffff; }
.chat-launcher img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }
.chat-window { position: fixed; right: 28px; bottom: 28px; z-index: 20; display: flex; flex-direction: column; width: min(410px, calc(100vw - 32px)); height: min(620px, calc(100vh - 48px)); overflow: hidden; border: 1px solid #dce7d8; border-radius: 16px; background: #f7faf6; box-shadow: 0 18px 50px #173c3238; }
.chat-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; background: #173c32; color: white; }
.chat-agent { display: flex; align-items: center; gap: 11px; }
.chat-agent img { width: 40px; height: 40px; border-radius: 50%; background: #d9f28f; object-fit: contain; }
.chat-agent strong, .chat-agent span { display: block; }
.chat-agent strong { font-size: 14px; }
.chat-agent span { margin-top: 4px; color: #c2d7c7; font-size: 11px; }
.chat-agent i { display: inline-block; width: 7px; height: 7px; margin-right: 4px; border-radius: 50%; background: #a8dc77; }
.chat-close { border: 0; padding: 2px 6px; background: transparent; color: #d5e5d8; font-size: 26px; line-height: 1; }
.chat-close:hover { color: white; }
.chat-messages { flex: 1; overflow-y: auto; padding: 20px 15px; background: #eef4ec; }
.chat-message { display: flex; margin-bottom: 12px; }
.chat-message--user { justify-content: flex-end; }
.chat-status { margin: 8px 4px; color: #718475; font-size: 11px; }
.chat-status--error { color: #b5533e; }
.chat-bubble { max-width: 82%; padding: 10px 12px 7px; border-radius: 13px 13px 13px 3px; background: white; color: #34493b; box-shadow: 0 2px 6px #173c3212; }
.chat-message--user .chat-bubble { border-radius: 13px 13px 3px 13px; background: #d9f28f; color: #173c32; }
.chat-bubble p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.45; }
.chat-bubble time { display: block; margin-top: 5px; color: #839187; font-size: 9px; text-align: right; }
.chat-composer { position: relative; display: grid; grid-template-columns: 1fr 38px; gap: 8px; padding: 12px 14px 27px; border-top: 1px solid #dfe8dc; background: white; }
.chat-composer textarea { min-height: 38px; max-height: 100px; resize: vertical; border: 1px solid #d7e2d4; border-radius: 9px; padding: 10px; outline: 0; color: #304238; font-size: 12px; }
.chat-composer textarea:focus { border-color: #8eb66d; }
.chat-composer button { align-self: start; width: 38px; height: 38px; border: 0; border-radius: 9px; background: #173c32; color: white; font-size: 18px; }
.chat-composer button:disabled { cursor: not-allowed; opacity: .45; }
.chat-composer small { position: absolute; bottom: 8px; left: 15px; color: #8a968d; font-size: 9px; }
.tutorial-modal { max-width: 520px; }
.tutorial-steps { display: grid; gap: 12px; }
.tutorial-step { display: flex; align-items: flex-start; gap: 12px; padding: 12px; border: 1px solid #dfe8dc; border-radius: 10px; background: #f7faf6; }
.tutorial-step > span { display: grid; place-items: center; flex: 0 0 26px; height: 26px; border-radius: 50%; background: #d9f28f; color: #173c32; font-weight: 700; }
.tutorial-step h3 { margin: 0 0 4px; font-size: 14px; }
.tutorial-step p { margin: 0; color: #718475; font-size: 12px; line-height: 1.4; }

@media (max-width: 650px) {
  .proactive-message { right: 86px; bottom: 25px; max-width: 190px; }
  .chat-launcher { right: 16px; bottom: 16px; width: 58px; height: 58px; }
  .chat-window { right: 16px; bottom: 16px; width: calc(100vw - 32px); height: min(620px, calc(100vh - 32px)); }
}
</style>
