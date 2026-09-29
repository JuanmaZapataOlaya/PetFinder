<script setup lang="ts">
defineProps<{ name: string; size?: number }>()
</script>

<template>
  <svg :width="size || 20" :height="size || 20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'grid'"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></template>
    <template v-else-if="name === 'search'"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></template>
    <template v-else-if="name === 'bell'"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></template>
    <template v-else-if="name === 'plus'"><path d="M12 5v14M5 12h14"/></template>
    <template v-else-if="name === 'paw'"><path d="M8 11.5c-1.8 0-3-1.7-3-3.5s1.2-3.1 2.7-3.1S10 6.2 10 8s-.7 3.5-2 3.5ZM16 11.5c1.8 0 3-1.7 3-3.5s-1.2-3.1-2.7-3.1S14 6.2 14 8s.7 3.5 2 3.5ZM12 20c-3.2 0-5-1.7-5-3.7 0-1.8 1.3-3.3 3-3.3.9 0 1.6.4 2 .9.4-.5 1.1-.9 2-.9 1.7 0 3 1.5 3 3.3 0 2-1.8 3.7-5 3.7Z"/></template>
    <template v-else-if="name === 'collar'"><path d="M4.5 5.5c1.8 3.2 4.3 4.8 7.5 4.8s5.7-1.6 7.5-4.8M12 10.3v3.2"/><path d="M9.5 13.5h5l1 5-3.5 2-3.5-2 1-5Z"/></template>
    <template v-else-if="name === 'heart'"><path d="M20.8 8.8c0 5.4-8.8 10-8.8 10s-8.8-4.6-8.8-10A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8.8 2.5Z"/></template>
    <template v-else-if="name === 'message'"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.5 8.5 0 0 1-3.5-.8L4 20l1.5-3.8A7.2 7.2 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/></template>
    <template v-else-if="name === 'chevron'"><path d="m9 18 6-6-6-6"/></template>
    <template v-else-if="name === 'map'"><path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/></template>
    <template v-else-if="name === 'menu'"><path d="M3 12h18M3 6h18M3 18h18"/></template>
    <template v-else-if="name === 'x'"><path d="M18 6 6 18M6 6l12 12"/></template>
    <template v-else-if="name === 'flag'"><path d="M5 21V4m0 0c4-3 7 3 14 0v9c-7 3-10-3-14 0"/></template>
    <template v-else-if="name === 'chart'"><path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-7"/></template>
    <template v-else-if="name === 'users'"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></template>
    <template v-else-if="name === 'clipboard'"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h3"/></template>
    <template v-else-if="name === 'mic'"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></template>
  </svg>
</template>