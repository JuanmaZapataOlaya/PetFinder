import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initializeAuth } from './services/authService'
import { loadTickets } from './data/tickets'

import './styles/main.css'

await initializeAuth()
try { await loadTickets() } catch (error) { console.error('No se pudieron cargar los reportes.', error) }
createApp(App).use(router).mount('#app')
