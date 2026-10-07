<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import ChatWidget from '@/components/ChatWidget.vue'
import LanguageSelector from '@/components/LanguageSelector.vue'
import { useI18n } from 'vue-i18n'
import { AUTH_STATE_CHANGED_EVENT, getCurrentUser, logout } from '@/services/authService'
import { useCurrentRoles } from '@/admin/composables/useCurrentRoles'
import { ADMIN_PERMISSIONS, canAccessAdminSection } from '@/admin/permissions'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const chatWidget = ref<InstanceType<typeof ChatWidget> | null>(null)
const activeNav = computed(() => {
  const routeTitles: Record<string, string> = {
    summary: t('navigation.routeTitles.summary'),
    explore: t('navigation.routeTitles.explore'),
    reports: t('navigation.routeTitles.reports'),
    Notifications: t('navigation.routeTitles.Notifications'),
  }
  return routeTitles[String(route.name)] || String(route.meta.label || t('navigation.summary'))
})
const user = ref(getCurrentUser())
const avatarFailed = ref(false)
const menuOpen = ref(false)
const fallbackAvatar = '/avatar-default.svg'
const avatarUrl = computed(() => avatarFailed.value || !user.value?.photoUrl ? fallbackAvatar : user.value.photoUrl)
const { roles, isStaff } = useCurrentRoles()

const navigation = computed(() => [
  { label: t('navigation.summary'), path: '/resumen', icon: 'grid' },
  { label: t('navigation.exploreReports'), path: '/explorar', icon: 'search' },
  { label: t('navigation.myReports'), path: '/reportes', icon: 'paw' },
  { label: t('navigation.notifications'), path: '/notifications', icon: 'message' },
  { label: t('navigation.petHistory'), path: '/historial-mascotas', icon: 'paw' },
  { label: t('navigation.personalInformation'), path: '/contact-info', icon: 'message' },
])

const adminNavigation = computed(() => [
  { label: t('navigation.summary'), path: '/admin/resumen', icon: 'grid', allowed: canAccessAdminSection(roles.value, 'resumen') },
  { label: t('navigation.claims'), path: '/admin/reclamos', icon: 'paw', allowed: canAccessAdminSection(roles.value, 'reclamos') },
  { label: t('navigation.fraudAndReports'), path: '/admin/reportes', icon: 'flag', allowed: canAccessAdminSection(roles.value, 'reportes') },
  { label: t('navigation.modelCosts'), path: '/admin/costos', icon: 'chart', allowed: canAccessAdminSection(roles.value, 'costos') },
  { label: t('navigation.usersAndRoles'), path: '/admin/usuarios', icon: 'users', allowed: canAccessAdminSection(roles.value, 'usuarios') },
  { label: t('navigation.audit'), path: '/admin/auditoria', icon: 'clipboard', allowed: canAccessAdminSection(roles.value, 'auditoria') },
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
      <div class="nav-label">{{ t('navigation.personalSpace') }}</div>
      <nav class="nav-list" :aria-label="t('accessibility.primaryNavigation')">
        <RouterLink v-for="item in navigation" :key="item.path" :to="item.path" class="nav-item"><Icon :name="item.icon" :size="17" /><span>{{ item.label }}</span></RouterLink>
      </nav>
      <template v-if="isStaff">
        <div class="nav-label admin-nav-label">{{ t('navigation.administration') }}</div>
        <nav class="nav-list" :aria-label="t('accessibility.adminNavigation')">
          <RouterLink v-for="item in adminNavigation" :key="item.path" :to="item.path" class="nav-item"><Icon :name="item.icon" :size="17" /><span>{{ item.label }}</span></RouterLink>
        </nav>
      </template>
      <div class="sidebar-spacer" />
      <div class="user-mini">
        <img class="avatar avatar-image" :src="avatarUrl" :alt="`${t('account.user')}: ${user?.name || t('account.user')}`" @error="handleAvatarError" />
        <div><strong>{{ user?.name || t('account.user') }}</strong><span>{{ t('account.personalAccount') }}</span></div>
        <button class="logout-button" :title="t('account.logout')" @click="handleLogout">{{ t('account.logoutButton') }}</button>
      </div>
    </aside>
    <main class="main-content">
      <header class="topbar">
        <div class="topbar-start">
          <button type="button" class="menu-toggle icon-button" :aria-label="t('accessibility.openNavigation')" @click="menuOpen = !menuOpen">
            <Icon :name="menuOpen ? 'x' : 'menu'" :size="22" />
          </button>
          <span class="crumb">PetFinder <b>/</b> {{ activeNav }}</span>
        </div>
        <div class="top-actions">
          <button type="button" class="icon-button" :aria-label="t('accessibility.openNotifications')" @click="router.push({ name: 'Notifications' })">
            <Icon name="bell" :size="19" /><i class="notification-dot" />
          </button>
          <button
            type="button"
            class="icon-button tutorial-launcher"
            :aria-label="t('accessibility.repeatTutorial')"
            :title="t('accessibility.repeatTutorial')"
            data-tutorial="repeat-tutorial"
            @click="chatWidget?.runTutorial()"
          >
            <Icon name="collar" :size="20" />
          </button>
          <img class="avatar avatar-image" :src="avatarUrl" :alt="`${t('account.user')}: ${user?.name || t('account.user')}`" @error="handleAvatarError" />
          <LanguageSelector />
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
