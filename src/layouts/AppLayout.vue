<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import ChatWidget from '@/components/ChatWidget.vue'
import { AUTH_STATE_CHANGED_EVENT, getCurrentUser, logout } from '@/services/authService'
import { useCurrentRoles } from '@/admin/composables/useCurrentRoles'
import { ADMIN_PERMISSIONS, canAccessAdminSection } from '@/admin/permissions'

const route = useRoute()
const router = useRouter()
const chatWidget = ref<InstanceType<typeof ChatWidget> | null>(null)
const activeNav = computed(() => String(route.meta.label || 'Resumen'))
const user = ref(getCurrentUser())
const avatarFailed = ref(false)
const menuOpen = ref(false)
const fallbackAvatar = '/avatar-default.svg'
const avatarUrl = computed(() => avatarFailed.value || !user.value?.photoUrl ? fallbackAvatar : user.value.photoUrl)
const { roles, isStaff } = useCurrentRoles()

const navigation = [
  { label: 'Resumen', path: '/resumen', icon: 'grid' },
  { label: 'Explorar reportes', path: '/explorar', icon: 'search' },
  { label: 'Mis reportes', path: '/reportes', icon: 'paw' },
  { label: 'Notificaciones', path: '/notifications', icon: 'message' },
  { label: 'Historial de mascotas', path: '/historial-mascotas', icon: 'paw' },
  { label: 'Información personal', path: '/contact-info', icon: 'message' },
]

const adminNavigation = computed(() => [
  { label: 'Resumen', path: '/admin/resumen', icon: 'grid', allowed: canAccessAdminSection(roles.value, 'resumen') },
  { label: 'Reclamos', path: '/admin/reclamos', icon: 'paw', allowed: canAccessAdminSection(roles.value, 'reclamos') },
  { label: 'Fraude y reportes', path: '/admin/reportes', icon: 'flag', allowed: canAccessAdminSection(roles.value, 'reportes') },
  { label: 'Costos de modelos', path: '/admin/costos', icon: 'chart', allowed: canAccessAdminSection(roles.value, 'costos') },
  { label: 'Usuarios y roles', path: '/admin/usuarios', icon: 'users', allowed: canAccessAdminSection(roles.value, 'usuarios') },
  { label: 'Auditoría', path: '/admin/auditoria', icon: 'clipboard', allowed: canAccessAdminSection(roles.value, 'auditoria') },
].filter((item) => item.allowed))

watch(route, () => { menuOpen.value = false })

function syncUser() {
  user.value = getCurrentUser()
  avatarFailed.value = false
}

function handleAvatarError() {
  avatarFailed.value = true
}

async function handleLogout() {
  await logout()
  await router.push('/login')
}

onMounted(() => {
  window.addEventListener(AUTH_STATE_CHANGED_EVENT, syncUser)
  window.addEventListener('storage', syncUser)
  syncUser()
})

onBeforeUnmount(() => {
  window.removeEventListener(AUTH_STATE_CHANGED_EVENT, syncUser)
  window.removeEventListener('storage', syncUser)
})
</script>

<template>
  <slot v-if="!user" />
  <div v-else class="app-shell">
    <div v-if="menuOpen" class="sidebar-backdrop" aria-hidden="true" @click="menuOpen = false" />
    <aside class="sidebar" :class="{ 'sidebar--open': menuOpen }">
      <RouterLink class="brand" to="/resumen"><span class="brand-mark"><Icon name="paw" :size="18" /></span><span>PetFinder</span></RouterLink>
      <div class="nav-label">Espacio personal</div>
      <nav class="nav-list" aria-label="Navegación principal">
        <RouterLink v-for="item in navigation" :key="item.path" :to="item.path" class="nav-item"><Icon :name="item.icon" :size="17" /><span>{{ item.label }}</span></RouterLink>
      </nav>
      <template v-if="isStaff">
        <div class="nav-label admin-nav-label">Administración</div>
        <nav class="nav-list" aria-label="Navegación administrativa">
          <RouterLink v-for="item in adminNavigation" :key="item.path" :to="item.path" class="nav-item"><Icon :name="item.icon" :size="17" /><span>{{ item.label }}</span></RouterLink>
        </nav>
      </template>
      <div class="sidebar-spacer" />
      <div class="user-mini">
        <img class="avatar avatar-image" :src="avatarUrl" :alt="`Foto de ${user?.name || 'Usuario'}`" @error="handleAvatarError" />
        <div><strong>{{ user?.name || 'Usuario' }}</strong><span>Cuenta personal</span></div>
        <button class="logout-button" title="Cerrar sesión" @click="handleLogout">Salir</button>
      </div>
    </aside>
    <main class="main-content">
      <header class="topbar">
        <div class="topbar-start">
          <button type="button" class="menu-toggle icon-button" aria-label="Abrir menú de navegación" @click="menuOpen = !menuOpen">
            <Icon :name="menuOpen ? 'x' : 'menu'" :size="22" />
          </button>
          <span class="crumb">PetFinder <b>/</b> {{ activeNav }}</span>
        </div>
        <div class="top-actions">
          <button type="button" class="icon-button" aria-label="Abrir notificaciones" @click="router.push({ name: 'Notifications' })">
            <Icon name="bell" :size="19" /><i class="notification-dot" />
          </button>
          <button
            type="button"
            class="icon-button tutorial-launcher"
            aria-label="Volver a ver el tutorial"
            title="Volver a ver el tutorial"
            data-tutorial="repeat-tutorial"
            @click="chatWidget?.runTutorial()"
          >
            <Icon name="collar" :size="20" />
          </button>
          <img class="avatar avatar-image" :src="avatarUrl" :alt="`Foto de ${user?.name || 'Usuario'}`" @error="handleAvatarError" />
        </div>
      </header>
      <slot />
    </main>
    <ChatWidget ref="chatWidget" />
  </div>
</template>

<style scoped>
.topbar-start {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-toggle {
  display: none;
}

@media (max-width: 640px) {
  .menu-toggle {
    display: grid;
  }
}
</style>
