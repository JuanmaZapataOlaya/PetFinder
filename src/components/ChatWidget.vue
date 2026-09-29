<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { AUTH_STATE_CHANGED_EVENT, getCurrentUser } from '@/services/authService'
import { createRealtimeSession, executeAgentAction, sendAgentMessage, startAgentSession, type AgentAction } from '@/services/agentService'
import Icon from '@/components/Icon.vue'
import TutorialConfirmationModal from '@/components/TutorialConfirmationModal.vue'
import { useTutorial } from '@/composables/useTutorial'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const router = useRouter()
const { isConfirmationVisible, runTutorial, acceptTutorial, closeTutorial } = useTutorial()
const isChatOpen = ref(false)
const draftMessage = ref('')
const agentSessionId = ref<string | null>(null)
const isAgentLoading = ref(false)
const agentError = ref('')
const isRealtimeActive = ref(false)
const isRealtimeStarting = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)
const proactiveMessage = ref('')
const remoteAudio = ref<HTMLAudioElement | null>(null)

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
let realtimePeerConnection: RTCPeerConnection | null = null
let realtimeDataChannel: RTCDataChannel | null = null
let microphoneStream: MediaStream | null = null

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
  if (isRealtimeActive.value || isRealtimeStarting.value) return
  isChatOpen.value = false
}

function sendRealtimeEvent(event: Record<string, unknown>) {
  if (realtimeDataChannel?.readyState === 'open') realtimeDataChannel.send(JSON.stringify(event))
}

function addRealtimeTranscript(role: 'user' | 'assistant', content: unknown) {
  if (typeof content !== 'string' || !content.trim()) return
  chatMessages.value.push({ id: nextMessageId++, role, content: content.trim(), timestamp: new Date() })
}

function handleRealtimeEvent(event: MessageEvent<string>) {
  try {
    const payload = JSON.parse(event.data) as { type?: string; transcript?: string }
    if (payload.type === 'conversation.item.input_audio_transcription.completed') {
      addRealtimeTranscript('user', payload.transcript)
    }
    if (payload.type === 'response.audio_transcript.done' || payload.type === 'response.output_audio_transcript.done') {
      addRealtimeTranscript('assistant', payload.transcript)
    }
  } catch {
    agentError.value = 'Se recibió un evento de voz inválido.'
  }
}

async function endRealtimeSession() {
  microphoneStream?.getTracks().forEach((track) => track.stop())
  microphoneStream = null
  realtimeDataChannel?.close()
  realtimeDataChannel = null
  realtimePeerConnection?.close()
  realtimePeerConnection = null
  if (remoteAudio.value) remoteAudio.value.srcObject = null
  isRealtimeActive.value = false
  isRealtimeStarting.value = false
}

async function startRealtimeSession() {
  if (isRealtimeActive.value || isRealtimeStarting.value) return
  isRealtimeStarting.value = true
  agentError.value = ''
  try {
    if (!agentSessionId.value) {
      const user = getCurrentUser()
      if (user) agentSessionId.value = await startAgentSession(user.id)
    }
    if (!agentSessionId.value) throw new Error('No hay una sesión activa del asistente.')

    const session = await createRealtimeSession(agentSessionId.value)
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    realtimePeerConnection = new RTCPeerConnection()
    realtimeDataChannel = realtimePeerConnection.createDataChannel('oai-events')
    realtimeDataChannel.addEventListener('message', handleRealtimeEvent)
    realtimeDataChannel.addEventListener('open', () => {
      sendRealtimeEvent({
        type: 'session.update',
        session: {
          audio: {
            input: { format: { type: 'audio/pcm', rate: 24000 } },
            output: { format: { type: 'audio/pcm', rate: 24000 } },
          },
          tools: session.tools,
        },
      })
    })
    realtimePeerConnection.addEventListener('track', (event) => {
      if (remoteAudio.value && event.streams[0]) {
        remoteAudio.value.srcObject = event.streams[0]
        void remoteAudio.value.play()
      }
    })
    realtimePeerConnection.addEventListener('connectionstatechange', () => {
      if (realtimePeerConnection?.connectionState === 'failed') {
        agentError.value = 'La conexión de voz se interrumpió.'
        void endRealtimeSession()
      }
    })
    microphoneStream.getTracks().forEach((track) => realtimePeerConnection?.addTrack(track, microphoneStream as MediaStream))

    const offer = await realtimePeerConnection.createOffer()
    await realtimePeerConnection.setLocalDescription(offer)
    const response = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(session.model)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.client_secret.value}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    })
    if (!response.ok) throw new Error('No fue posible conectar la sesión de voz.')
    await realtimePeerConnection.setRemoteDescription({ type: 'answer', sdp: await response.text() })
    isRealtimeActive.value = true
  } catch (error) {
    await endRealtimeSession()
    agentError.value = error instanceof Error ? error.message : 'No fue posible iniciar la sesión de voz.'
  } finally {
    isRealtimeStarting.value = false
  }
}

function startTutorial() {
  closeChat()
  void acceptTutorial()
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
  if (isRealtimeActive.value || isRealtimeStarting.value) return
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
  } finally {
    isAgentLoading.value = false
  }
}

function handleAgentAction(action: AgentAction | null, payload: Record<string, unknown>) {
  const result = executeAgentAction({ action, payload })
  if (!result) return
  if (result.type === 'RUN_TUTORIAL') {
    runTutorial()
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
defineExpose({ addAssistantMessage, runTutorial })

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
  void endRealtimeSession()
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
      <button v-if="!isRealtimeActive && !isRealtimeStarting" type="button" class="chat-close" aria-label="Cerrar asistente virtual" @click="closeChat">×</button>
    </header>
    <div ref="messagesContainer" class="chat-messages" role="log" aria-live="polite">
      <div v-for="message in chatMessages" :key="message.id" class="chat-message" :class="`chat-message--${message.role}`">
        <div class="chat-bubble">
          <p>{{ message.content }}</p>
          <time :datetime="message.timestamp.toISOString()">{{ formatMessageTime(message.timestamp) }}</time>
        </div>
      </div>
    </div>
    <div v-if="isAgentLoading || agentError" class="chat-status-area">
      <p v-if="isAgentLoading" class="chat-status" role="status">El asistente está escribiendo...</p>
      <p v-else-if="agentError" class="chat-status chat-status--error" role="alert">{{ agentError }}</p>
    </div>
    <div v-if="isRealtimeActive || isRealtimeStarting" class="realtime-panel">
      <span class="realtime-indicator" :class="{ 'realtime-indicator--starting': isRealtimeStarting }" />
      <p>{{ isRealtimeStarting ? 'Conectando al asistente...' : 'Sesión de voz activa' }}</p>
      <button type="button" :disabled="isRealtimeStarting" @click="endRealtimeSession">Finalizar sesión</button>
    </div>
    <form v-else class="chat-composer" @submit.prevent="sendMessage">
      <textarea v-model="draftMessage" rows="1" aria-label="Escribe tu mensaje" placeholder="Escribe tu mensaje..." @keydown="handleMessageKeydown" />
      <button type="submit" aria-label="Enviar mensaje" :disabled="!draftMessage.trim()">➤</button>
      <button type="button" class="voice-button" aria-label="Activar asistente por voz" title="Activar asistente por voz" @click="startRealtimeSession"><Icon name="mic" :size="17" /></button>
      <small>Enter para enviar · Shift + Enter para una nueva línea</small>
    </form>
    <audio ref="remoteAudio" autoplay />
  </section>
  <TutorialConfirmationModal
    :visible="isConfirmationVisible"
    @accept="startTutorial"
    @cancel="closeTutorial"
  />
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
.chat-status-area { flex: 0 0 auto; border-top: 1px solid #dfe8dc; padding: 8px 15px; background: #f7faf6; }
.chat-status { margin: 0 4px; color: #718475; font-size: 11px; line-height: 1.35; }
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
.voice-button { grid-column: 2; grid-row: 2; display: grid; place-items: center; border: 1px solid #bfd0bb !important; background: #f0f6ed !important; color: #173c32 !important; }
.chat-composer small { position: absolute; bottom: 8px; left: 15px; color: #8a968d; font-size: 9px; }
.realtime-panel { display: flex; align-items: center; gap: 10px; padding: 15px; border-top: 1px solid #dfe8dc; background: white; }
.realtime-panel p { flex: 1; margin: 0; color: #34493b; font-size: 12px; }
.realtime-panel button { border: 0; border-radius: 8px; padding: 9px 12px; background: #b5533e; color: white; font-size: 11px; }
.realtime-panel button:disabled { cursor: wait; opacity: .55; }
.realtime-indicator { width: 10px; height: 10px; flex: 0 0 auto; border-radius: 50%; background: #78ad58; box-shadow: 0 0 0 4px #dcebd7; }
.realtime-indicator--starting { background: #d09a48; box-shadow: 0 0 0 4px #f3e5c9; }
@media (max-width: 650px) {
  .proactive-message { right: 86px; bottom: 25px; max-width: 190px; }
  .chat-launcher { right: 16px; bottom: 16px; width: 58px; height: 58px; }
  .chat-window { right: 16px; bottom: 16px; width: calc(100vw - 32px); height: min(620px, calc(100vh - 32px)); }
}
</style>
