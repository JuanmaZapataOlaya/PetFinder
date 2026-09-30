import { onMounted, ref } from 'vue'

export function useAdminData<T>(loadData: () => Promise<T>) {
  const data = ref<T | null>(null)
  const loading = ref(true)
  const error = ref('')

  async function reload() {
    loading.value = true
    error.value = ''
    try {
      data.value = await loadData()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'No se pudo cargar la información.'
      data.value = null
    } finally {
      loading.value = false
    }
  }

  onMounted(reload)
  return { data, loading, error, reload }
}
