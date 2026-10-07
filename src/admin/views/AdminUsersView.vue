<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import VChart from 'vue-echarts'
import '@/admin/charts/echarts'
import { getUsersPage, deleteUser } from '@/admin/services/adminApi'
import { useAdminQuery } from '@/admin/composables/useAdminQuery'

interface UserRow {
  id: string
  name: string
  email: string | null
  photo_url: string | null
  created_at: string
  contact: {
    full_name?: string | null
    age?: number | null
    phone_number?: string | null
    email?: string | null
    address?: string | null
    latitude?: number | null
    longitude?: number | null
  } | null
  roles: Array<{ id: number; name: string }>
}
interface UsersPage { total: number; users: UserRow[] }

const pageSize = 50
const { t, locale } = useI18n()
const offset = ref(0)
const deletingId = ref('')
const actionError = ref('')
const actionSuccess = ref('')

const query = useAdminQuery(() => getUsersPage(pageSize, offset.value))
const page = computed(() => Math.floor(offset.value / pageSize) + 1)
const data = computed(() => query.data.value as UsersPage | null)
const loading = computed(() => query.loading.value)
const error = computed(() => query.error.value)

async function reload() {
  await query.refetch()
}

onMounted(reload)
const roleOption = computed(() => {
  const grouped = new Map<string, number>()
  for (const user of query.data.value?.users ?? []) {
    for (const role of user.roles) grouped.set(role.name, (grouped.get(role.name) ?? 0) + 1)
  }
  return {
    color: ['#e57959', '#77a661', '#5f8fc4', '#b37ac8'],
    tooltip: { trigger: 'item' },
    series: [{ name: t('admin.rolesOnPage'), type: 'pie', radius: ['40%', '68%'], data: [...grouped].map(([name, value]) => ({ name, value })) }],
  }
})

async function eliminarUsuario(user: UserRow) {
  if (!window.confirm(t('admin.confirmDeleteUser', { name: user.name }))) return
  deletingId.value = user.id
  actionError.value = ''
  actionSuccess.value = ''
  try {
    await deleteUser(user.id)
    if (offset.value > 0 && data.value?.users.length === 1) offset.value = Math.max(0, offset.value - pageSize)
    actionSuccess.value = t('admin.userDeleted', { name: user.name })
    await reload()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : t('admin.deleteUserError')
  } finally {
    deletingId.value = ''
  }
}
</script>

<template>
  <section class="page-view admin-page section-dashboard">
    <header class="section-heading"><div><div class="eyebrow">{{ t('admin.panel') }}</div><h1>{{ t('admin.usersTitle') }}</h1><p>{{ t('admin.usersIntro') }}</p></div></header>
    <div v-if="loading" class="section-state">{{ t('admin.loadingUsers') }}</div>
    <div v-else-if="error" class="section-state error-state" role="alert">{{ error }} <button @click="reload">{{ t('common.retry') }}</button></div>
    <template v-else-if="data">
      <p v-if="actionError" class="action-message action-error" role="alert">{{ actionError }}</p>
      <p v-if="actionSuccess" class="action-message action-success" role="status">{{ actionSuccess }}</p>
      <div class="users-summary">
        <article class="admin-kpi-card"><div class="admin-kpi-label">{{ t('admin.registeredUsers') }}</div><strong>{{ data.total.toLocaleString(locale) }}</strong><p>{{ t('admin.availableProfiles') }}</p></article>
        <article class="admin-chart-card roles-card"><header><div><h2>{{ t('admin.assignedRoles') }}</h2><p>{{ t('admin.currentPage') }}</p></div></header><VChart v-if="data.users.length" class="admin-chart" :option="roleOption" autoresize /><div v-else class="admin-chart-message">{{ t('admin.noUsersPage') }}</div></article>
      </div>
      <article class="admin-chart-card users-table-card">
        <header><div><h2>{{ t('admin.userProfiles') }}</h2><p>{{ t('admin.showingUsers', { count: data.users.length, total: data.total }) }}</p></div></header>
        <div v-if="!data.users.length" class="admin-chart-message">{{ t('admin.noUsers') }}</div>
        <div v-else class="table-scroll"><table><thead><tr><th>{{ t('admin.user') }}</th><th>{{ t('admin.account') }}</th><th>{{ t('admin.contact') }}</th><th>{{ t('admin.address') }}</th><th>{{ t('admin.roles') }}</th><th>{{ t('admin.registered') }}</th><th>{{ t('admin.action') }}</th></tr></thead><tbody>
          <tr v-for="user in data.users" :key="user.id">
            <td class="identity-cell"><img v-if="user.photo_url" :src="user.photo_url" alt="" /><span>{{ user.contact?.full_name || user.name }}</span></td>
            <td>{{ user.email || user.contact?.email || t('admin.noEmail') }}<small>{{ user.id }}</small></td>
            <td>{{ user.contact?.phone_number || '—' }}<small v-if="user.contact?.age">{{ t('admin.age') }}: {{ user.contact.age }}</small></td>
            <td>{{ user.contact?.address || '—' }}<small v-if="user.contact?.latitude !== null && user.contact?.latitude !== undefined">{{ user.contact.latitude }}, {{ user.contact.longitude }}</small></td>
            <td><span v-if="user.roles.length" class="role-tags"><b v-for="role in user.roles" :key="role.id">{{ role.name }}</b></span><span v-else>{{ t('admin.noRole') }}</span></td>
            <td>{{ new Date(user.created_at).toLocaleDateString(locale) }}</td>
            <td><button class="delete-button" type="button" :disabled="deletingId === user.id" @click="eliminarUsuario(user)">{{ deletingId === user.id ? t('admin.deleteInProgress') : t('dashboard.delete') }}</button></td>
          </tr>
        </tbody></table></div>
        <footer class="pagination"><button type="button" :disabled="offset === 0 || loading" @click="offset -= pageSize; reload()">{{ t('common.previous') }}</button><span>{{ t('common.pageOf', { page, total: Math.max(1, Math.ceil(data.total / pageSize)) }) }}</span><button type="button" :disabled="offset + pageSize >= data.total || loading" @click="offset += pageSize; reload()">{{ t('common.next') }}</button></footer>
      </article>
    </template>
  </section>
</template>

<style scoped>
.section-dashboard { --ink:#314238; --muted:#758178; }
.section-heading { margin-bottom:18px; }
.section-heading h1 { margin:4px 0 6px; font-family:'Space Grotesk',sans-serif; font-size:clamp(25px,3vw,34px); }
.section-heading p { margin:0; color:var(--muted); font-size:13px; }
.users-summary { display:grid; grid-template-columns:minmax(210px,.7fr) minmax(0,1.3fr); gap:15px; margin-bottom:15px; }
.roles-card h2,.users-table-card h2 { margin:0 0 5px; color:var(--ink); font-size:17px; }
.roles-card header p,.users-table-card header p { margin:0; color:var(--muted); font-size:12px; }
.roles-card .admin-chart { height:200px; }
.table-scroll { overflow:auto; max-height:650px; }
table { width:100%; border-collapse:collapse; font-size:11px; }
th,td { padding:10px; border-bottom:1px solid #edf1ec; text-align:left; vertical-align:top; }
th { position:sticky; top:0; z-index:1; background:white; color:var(--muted); white-space:nowrap; }
td small { display:block; max-width:200px; margin-top:4px; color:var(--muted); overflow-wrap:anywhere; }
.identity-cell { display:flex; align-items:center; gap:8px; min-width:140px; font-weight:600; }
.identity-cell img { width:32px; height:32px; border-radius:50%; object-fit:cover; }
.role-tags { display:flex; flex-wrap:wrap; gap:4px; }
.role-tags b { padding:4px 6px; border-radius:12px; background:#eef3ec; color:#507e55; font-size:10px; }
.delete-button { border:1px solid #edc7c0; border-radius:6px; background:#fff9f8; padding:6px 8px; color:#ab4a3a; cursor:pointer; white-space:nowrap; }
.delete-button:disabled { opacity:.6; cursor:wait; }
.pagination { display:flex; align-items:center; justify-content:center; gap:16px; padding-top:14px; color:var(--muted); font-size:12px; }
.pagination button { min-height:34px; padding:0 10px; border:1px solid #dce5da; border-radius:7px; background:white; color:var(--ink); cursor:pointer; }
.pagination button:disabled { opacity:.45; cursor:default; }
.action-message { margin:10px 0; padding:10px; border-radius:7px; font-size:13px; }
.action-error { background:#fff0ed; color:#a34232; }
.action-success { background:#edf6eb; color:#426e43; }
.section-state { display:grid; min-height:160px; place-content:center; gap:10px; border:1px solid #e5ebe3; border-radius:10px; background:white; text-align:center; color:var(--muted); }
.error-state { color:#a34232; }
@media(max-width:780px) { .users-summary { grid-template-columns:1fr; } }
</style>
