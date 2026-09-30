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
const realtimeStatus = ref<'listening' | 'userSpeaking' | 'thinking' | 'speaking'>('listening')
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

const realtimeStatusLabels = {
  listening: 'Te escucho, habla cuando quieras',
  userSpeaking: 'Escuchando...',
  thinking: 'Pensando...',
  speaking: 'Hablando... (puedes interrumpirme)',
} as const

let nextMessageId = 3
let proactiveMessageIndex = 0
let proactiveMessageTimer: ReturnType<typeof setInterval> | undefined
let proactiveMessageHideTimer: ReturnType<typeof setTimeout> | undefined
let realtimeWebSocket: WebSocket | null = null
let microphoneStream: MediaStream | null = null
let audioContext: AudioContext | null = null
let audioInputProcessor: ScriptProcessorNode | null = null
let audioMediaStreamSource: MediaStreamAudioSourceNode | null = null
let nextPlaybackTime = 0
// Assistant audio arrives faster than real time, so it is queued ahead. Tracking the
// queued sources lets us silence them immediately when the user interrupts.
const scheduledSources = new Set<AudioBufferSourceNode>()
const interruptedItemIds = new Set<string>()
let playingItemId: string | null = null
let playingItemStartTime = 0

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

function convertFloat32ToInt16(float32Array: Float32Array): Int16Array {
  const int16 = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32Array[i] ?? 0))
    int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return int16
}

function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0)
  }
  return btoa(binary)
}

function playAudioChunk(base64Audio: string, itemId: string | null) {
  if (!audioContext || audioContext.state === 'closed') return
  if (itemId && interruptedItemIds.has(itemId)) return
  if (audioContext.state === 'suspended') {
    void audioContext.resume()
  }

  const binaryString = atob(base64Audio)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const int16Array = new Int16Array(bytes.buffer)
  const float32Array = new Float32Array(int16Array.length)
  for (let i = 0; i < int16Array.length; i++) {
    const sample = int16Array[i] ?? 0
    float32Array[i] = sample < 0 ? sample / 32768 : sample / 32767
  }

  const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000)
  audioBuffer.copyToChannel(float32Array, 0)

  const bufferSource = audioContext.createBufferSource()
  bufferSource.buffer = audioBuffer
  bufferSource.connect(audioContext.destination)

  const startTime = Math.max(audioContext.currentTime, nextPlaybackTime)
  if (itemId !== playingItemId) {
    playingItemId = itemId
    playingItemStartTime = startTime
  }
  scheduledSources.add(bufferSource)
  bufferSource.addEventListener('ended', () => {
    scheduledSources.delete(bufferSource)
    if (scheduledSources.size === 0 && realtimeStatus.value === 'speaking') realtimeStatus.value = 'listening'
  })
  bufferSource.start(startTime)
  nextPlaybackTime = startTime + audioBuffer.duration
  realtimeStatus.value = 'speaking'
}

function interruptAssistantAudio() {
  if (!audioContext) return
  const now = audioContext.currentTime
  if (playingItemId && nextPlaybackTime > now) {
    // Tell the model how much of its answer the user actually heard.
    const playedMs = Math.max(0, Math.floor((now - playingItemStartTime) * 1000))
    sendRealtimeEvent({ type: 'conversation.item.truncate', item_id: playingItemId, content_index: 0, audio_end_ms: playedMs })
    interruptedItemIds.add(playingItemId)
  }
  scheduledSources.forEach((source) => {
    try {
      source.stop()
    } catch {
      // Source already finished.
    }
  })
  scheduledSources.clear()
  playingItemId = null
  nextPlaybackTime = now
}

function sendRealtimeEvent(event: Record<string, unknown>) {
  if (realtimeWebSocket?.readyState === WebSocket.OPEN) {
    realtimeWebSocket.send(JSON.stringify(event))
  }
}

function handleRealtimeMessage(event: MessageEvent<string>) {
  try {
    const payload = JSON.parse(event.data) as Record<string, unknown>
    const type = payload.type as string | undefined

    if ((type === 'response.audio.delta' || type === 'response.output_audio.delta') && typeof payload.delta === 'string') {
      playAudioChunk(payload.delta, typeof payload.item_id === 'string' ? payload.item_id : null)
    }

    if (type === 'input_audio_buffer.speech_started') {
      // Barge-in: the server cancels its response; we stop what is still queued locally.
      interruptAssistantAudio()
      realtimeStatus.value = 'userSpeaking'
    }
    if (type === 'input_audio_buffer.speech_stopped') {
      realtimeStatus.value = 'thinking'
    }
    if (type === 'response.done' && scheduledSources.size === 0 && realtimeStatus.value === 'thinking') {
      realtimeStatus.value = 'listening'
    }

    if (type === 'error') {
      const errorDetail = payload.error as { message?: unknown; code?: unknown } | undefined
      // Truncating/cancelling right as a response ends is a benign race.
      if (errorDetail?.code === 'response_cancel_not_active' || /truncat/i.test(String(errorDetail?.message ?? ''))) return
      agentError.value = typeof errorDetail?.message === 'string'
        ? `Error del servicio de voz: ${errorDetail.message}`
        : 'Error en el servicio de voz en tiempo real.'
    }

    if (type === 'response.function_call_arguments.done') {
      const name = payload.name as AgentAction | undefined
      const rawArgs = payload.arguments
      let parsedArgs: Record<string, unknown> = {}
      if (typeof rawArgs === 'string') {
        try {
          parsedArgs = JSON.parse(rawArgs)
        } catch {
          parsedArgs = {}
        }
      } else if (rawArgs && typeof rawArgs === 'object') {
        parsedArgs = rawArgs as Record<string, unknown>
      }
      if (name) {
        handleAgentAction(name, parsedArgs)
        if (typeof payload.call_id === 'string') {
          sendRealtimeEvent({
            type: 'conversation.item.create',
            item: { type: 'function_call_output', call_id: payload.call_id, output: JSON.stringify({ status: 'ok' }) },
          })
          sendRealtimeEvent({ type: 'response.create' })
        }
      }
    }
  } catch {
    agentError.value = 'Se recibió un evento de voz inválido.'
  }
}

async function endRealtimeSession() {
  microphoneStream?.getTracks().forEach((track) => track.stop())
  microphoneStream = null
  if (audioInputProcessor) {
    audioInputProcessor.disconnect()
    audioInputProcessor = null
  }
  if (audioMediaStreamSource) {
    audioMediaStreamSource.disconnect()
    audioMediaStreamSource = null
  }
  if (audioContext && audioContext.state !== 'closed') {
    void audioContext.close()
    audioContext = null
  }
  nextPlaybackTime = 0
  scheduledSources.clear()
  interruptedItemIds.clear()
  playingItemId = null
  realtimeStatus.value = 'listening'
  if (realtimeWebSocket) {
    realtimeWebSocket.close()
    realtimeWebSocket = null
  }
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

    // Echo cancellation keeps the assistant's own voice from triggering an interruption.
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioContext = new AudioCtx({ sampleRate: 24000 })
    nextPlaybackTime = audioContext.currentTime

    realtimeWebSocket = new WebSocket(session.ws_url)

    realtimeWebSocket.addEventListener('open', () => {
      isRealtimeActive.value = true
      isRealtimeStarting.value = false

      // Instructions, tools and audio settings are configured by the agent service.

      if (audioContext && microphoneStream) {
        audioMediaStreamSource = audioContext.createMediaStreamSource(microphoneStream)
        audioInputProcessor = audioContext.createScriptProcessor(4096, 1, 1)
        audioInputProcessor.onaudioprocess = (event) => {
          if (!isRealtimeActive.value || realtimeWebSocket?.readyState !== WebSocket.OPEN) return
          const inputData = event.inputBuffer.getChannelData(0)
          const pcm16 = convertFloat32ToInt16(inputData)
          const base64Audio = arrayBufferToBase64(pcm16.buffer)
          sendRealtimeEvent({
            type: 'input_audio_buffer.append',
            audio: base64Audio,
          })
        }
        audioMediaStreamSource.connect(audioInputProcessor)
        audioInputProcessor.connect(audioContext.destination)
      }
    })

    realtimeWebSocket.addEventListener('message', handleRealtimeMessage)

    realtimeWebSocket.addEventListener('error', () => {
      agentError.value = 'Error en la conexión con el servicio de voz en tiempo real.'
      void endRealtimeSession()
    })

    realtimeWebSocket.addEventListener('close', () => {
      if (isRealtimeActive.value) {
        void endRealtimeSession()
      }
    })
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
      <p>{{ isRealtimeStarting ? 'Conectando al asistente...' : realtimeStatusLabels[realtimeStatus] }}</p>
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
