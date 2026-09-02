<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
const navigation = [
  { label: 'Resumen', path: '/resumen', icon: 'grid' },
  { label: 'Explorar reportes', path: '/explorar', icon: 'search' },
  { label: 'Mis reportes', path: '/reportes', icon: 'paw' },
  { label: 'Notificaciones', path: '/notifications', icon: 'message' },
  { label: 'Información personal', path: '/contact-info', icon: 'message' },
]

function syncUser() {
  user.value = getCurrentUser()
  avatarFailed.value = false
}

function handleAvatarError() {
  avatarFailed.value = true
}

function handleStorageChange(event: StorageEvent) {
  if (event.key === 'petfinder.session' || event.key === 'petfinder.users') syncUser()
}

onMounted(() => {
  window.addEventListener(AUTH_STATE_CHANGED_EVENT, syncUser)
  window.addEventListener('storage', handleStorageChange)
})

onBeforeUnmount(() => {
  window.removeEventListener(AUTH_STATE_CHANGED_EVENT, syncUser)
  window.removeEventListener('storage', handleStorageChange)
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
      <div class="help-box"><strong>¿Necesitas ayuda?</strong><p>Estamos aquí para ayudarte a volver a encontrarlos.</p></div>
      <div class="user-mini"><img class="avatar avatar-image" :src="avatarUrl" :alt="`Foto de ${user?.name || 'Usuario'}`" @error="handleAvatarError" /><div><strong>{{ user?.name || 'Usuario' }}</strong><span>Cuenta personal</span></div><button class="logout-button" title="Cerrar sesión" @click="logout(); router.push('/login')">Salir</button></div>
    </aside>
    <main class="main-content">
      <header class="topbar"><span class="crumb">PetFinder <b>/</b> {{ activeNav }}</span><div class="top-actions"><button type="button" class="icon-button" aria-label="Abrir notificaciones" @click="router.push({ name: 'Notifications' })"><Icon name="bell" :size="19" /><i class="notification-dot" /></button><img class="avatar avatar-image" :src="avatarUrl" :alt="`Foto de ${user?.name || 'Usuario'}`" @error="handleAvatarError" /></div></header>
      <slot />
    </main>
  </div>
</template>