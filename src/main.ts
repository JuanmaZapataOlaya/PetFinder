import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initializeAuth } from './services/authService'
import { loadTickets } from './data/tickets'
import i18n from './plugins/i18n'

import './styles/main.css'

await initializeAuth()
try { await loadTickets() } catch (error) { console.error('No se pudieron cargar los reportes.', error) }
createApp(App).use(i18n).use(router).mount('#app')
