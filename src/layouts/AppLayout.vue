<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { AUTH_STATE_CHANGED_EVENT, getCurrentUser, logout } from '@/services/authService'

const route = useRoute()
const router = useRouter()
const activeNav = computed(() => String(route.meta.label || 'Resumen'))
const user = ref(getCurrentUser())
const avatarFailed = ref(false)
const fallbackAvatar = '/avatar-default.svg'
const avatarUrl = computed(() => avatarFailed.value || !user.value?.photoUrl ? fallbackAvatar : user.value.photoUrl)
interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const emit = defineEmits<{
  (event: 'message-sent', message: ChatMessage): void
}>()

const isChatOpen = ref(false)
const draftMessage = ref('')
const proactiveMessages = [
  'Guau, guau... ¿necesitas ayuda con algo?',
  '¿Buscas a tu mascota? Mi olfato es muy agudo, quizas pueda encontrarla',
  '¡Grrr! No dejes que la interfaz te confunda, yo te guío sin morder.',
  'Auuuu... Siento que hay notificaciones recientes que deberías ver.',
]
const proactiveMessage = ref('')
const chatMessages = ref<ChatMessage[]>([
  { id: 1, role: 'assistant', content: '¡Hola! Soy tu asistente virtual de PetFinder.', timestamp: new Date() },
  { id: 2, role: 'assistant', content: 'Puedo orientarte sobre reportes, mascotas y el uso de la plataforma.', timestamp: new Date() },
])
const messagesContainer = ref<HTMLElement | null>(null)
let nextMessageId = 3
let proactiveMessageIndex = 0
let proactiveMessageTimer: ReturnType<typeof setInterval> | undefined
let proactiveMessageHideTimer: ReturnType<typeof setTimeout> | undefined
const navigation = [
  { label: 'Resumen', path: '/resumen', icon: 'grid' },
  { label: 'Explorar reportes', path: '/explorar', icon: 'search' },
  { label: 'Mis reportes', path: '/reportes', icon: 'paw' },
  { label: 'Notificaciones', path: '/notifications', icon: 'message' },
  { label: 'Historial de mascotas', path: '/historial-mascotas', icon: 'paw' },
  { label: 'Información personal', path: '/contact-info', icon: 'message' },
]

function syncUser() {
  user.value = getCurrentUser()
  avatarFailed.value = false
}

function handleAvatarError() {
  avatarFailed.value = true
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
  proactiveMessageHideTimer = setTimeout(() => {
    proactiveMessage.value = ''
  }, 5000)
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

function sendMessage() {
  const content = draftMessage.value.trim()
  if (!content) return

  const message: ChatMessage = { id: nextMessageId++, role: 'user', content, timestamp: new Date() }
  chatMessages.value.push(message)
  draftMessage.value = ''
  emit('message-sent', message)
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

async function handleLogout() {
  await logout()
  await router.push('/login')
}

watch(chatMessages, scrollMessagesToEnd, { deep: true })
defineExpose({ addAssistantMessage })

onMounted(() => {
  window.addEventListener(AUTH_STATE_CHANGED_EVENT, syncUser)
  window.addEventListener('storage', syncUser)
  proactiveMessageTimer = setInterval(showNextProactiveMessage, 14000)
  proactiveMessageHideTimer = setTimeout(showNextProactiveMessage, 1000)
})

onBeforeUnmount(() => {
  window.removeEventListener(AUTH_STATE_CHANGED_EVENT, syncUser)
  window.removeEventListener('storage', syncUser)
  if (proactiveMessageTimer) clearInterval(proactiveMessageTimer)
  if (proactiveMessageHideTimer) clearTimeout(proactiveMessageHideTimer)
})
</script>

<template>
  <slot v-if="!user" />
  <div v-else class="app-shell">
    <aside class="sidebar">
      <RouterLink class="brand" to="/resumen"><span class="brand-mark"><Icon name="paw" :size="18" /></span><span>PetFinder</span></RouterLink>
      <div class="nav-label">Espacio personal</div>
      <nav class="nav-list" aria-label="Navegación principal">
        <RouterLink v-for="item in navigation" :key="item.path" :to="item.path" class="nav-item"><Icon :name="item.icon" :size="17" /><span>{{ item.label }}</span></RouterLink>
      </nav>
      <div class="sidebar-spacer" />
      <div class="user-mini"><img class="avatar avatar-image" :src="avatarUrl" :alt="`Foto de ${user?.name || 'Usuario'}`" @error="handleAvatarError" /><div><strong>{{ user?.name || 'Usuario' }}</strong><span>Cuenta personal</span></div><button class="logout-button" title="Cerrar sesión" @click="handleLogout">Salir</button></div>
    </aside>
    <main class="main-content">
      <header class="topbar"><span class="crumb">PetFinder <b>/</b> {{ activeNav }}</span><div class="top-actions"><button type="button" class="icon-button" aria-label="Abrir notificaciones" @click="router.push({ name: 'Notifications' })"><Icon name="bell" :size="19" /><i class="notification-dot" /></button><img class="avatar avatar-image" :src="avatarUrl" :alt="`Foto de ${user?.name || 'Usuario'}`" @error="handleAvatarError" /></div></header>
      <slot />
    </main>
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
        </div>
      </div>
      <form class="chat-composer" @submit.prevent="sendMessage">
        <textarea v-model="draftMessage" rows="1" aria-label="Escribe tu mensaje" placeholder="Escribe tu mensaje..." @keydown="handleMessageKeydown" />
        <button type="submit" aria-label="Enviar mensaje" :disabled="!draftMessage.trim()">➤</button>
        <small>Enter para enviar · Shift + Enter para una nueva línea</small>
      </form>
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
.chat-agent { display: flex; align-items: center; gap: 11px; }.chat-agent img { width: 40px; height: 40px; border-radius: 50%; background: #d9f28f; object-fit: contain; }.chat-agent strong, .chat-agent span { display: block; }.chat-agent strong { font-size: 14px; }.chat-agent span { margin-top: 4px; color: #c2d7c7; font-size: 11px; }.chat-agent i { display: inline-block; width: 7px; height: 7px; margin-right: 4px; border-radius: 50%; background: #a8dc77; }
.chat-close { border: 0; padding: 2px 6px; background: transparent; color: #d5e5d8; font-size: 26px; line-height: 1; }.chat-close:hover { color: white; }
.chat-messages { flex: 1; overflow-y: auto; padding: 20px 15px; background: #eef4ec; }.chat-message { display: flex; margin-bottom: 12px; }.chat-message--user { justify-content: flex-end; }
.chat-bubble { max-width: 82%; padding: 10px 12px 7px; border-radius: 13px 13px 13px 3px; background: white; color: #34493b; box-shadow: 0 2px 6px #173c3212; }.chat-message--user .chat-bubble { border-radius: 13px 13px 3px 13px; background: #d9f28f; color: #173c32; }.chat-bubble p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.45; }.chat-bubble time { display: block; margin-top: 5px; color: #839187; font-size: 9px; text-align: right; }
.chat-composer { position: relative; display: grid; grid-template-columns: 1fr 38px; gap: 8px; padding: 12px 14px 27px; border-top: 1px solid #dfe8dc; background: white; }.chat-composer textarea { min-height: 38px; max-height: 100px; resize: vertical; border: 1px solid #d7e2d4; border-radius: 9px; padding: 10px; outline: 0; color: #304238; font-size: 12px; }.chat-composer textarea:focus { border-color: #8eb66d; }.chat-composer button { align-self: start; width: 38px; height: 38px; border: 0; border-radius: 9px; background: #173c32; color: white; font-size: 18px; }.chat-composer button:disabled { cursor: not-allowed; opacity: .45; }.chat-composer small { position: absolute; bottom: 8px; left: 15px; color: #8a968d; font-size: 9px; }
@media (max-width: 650px) { .proactive-message { right: 86px; bottom: 25px; max-width: 190px; }.chat-launcher { right: 16px; bottom: 16px; width: 58px; height: 58px; }.chat-window { right: 16px; bottom: 16px; width: calc(100vw - 32px); height: min(620px, calc(100vh - 32px)); } }
</style>