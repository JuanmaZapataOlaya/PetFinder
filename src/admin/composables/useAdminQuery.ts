import { ref } from 'vue'
import { useRouter } from 'vue-router'

export function useAdminQuery<T>(query: () => Promise<T>) {
  const router = useRouter()
  const data = ref<T | null>(null)
  const loading = ref(false)
  const error = ref('')

  async function refetch() {
    loading.value = true
    error.value = ''
    try {
      data.value = await query()
    } catch (cause) {
      const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : ''
      if (code === '42501') {
        await router.push({ name: 'admin-forbidden' })
      }
      error.value = cause instanceof Error ? cause.message : 'No se pudo cargar la información administrativa.'
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, refetch }
}