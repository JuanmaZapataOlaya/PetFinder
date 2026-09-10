<script setup lang="ts">
/// <reference types="google.maps" />
import { onMounted, ref, watch } from 'vue'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
if (googleMapsKey) setOptions({ key: googleMapsKey, v: 'weekly' })

const props = withDefaults(defineProps<{ latitude?: number; longitude?: number; height?: string; interactive?: boolean; imageUrl?: string; otherMarkers?: Array<{ latitude: number; longitude: number; image: string; name: string }>; radiusMeters?: number }>(), { latitude: 19.4326, longitude: -99.1332, height: '250px', interactive: true, imageUrl: '', otherMarkers: () => [], radiusMeters: 0 })
const emit = defineEmits<{ locationChange: [location: { latitude: number; longitude: number; address: string }] }>()
const hasApiKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
const mapError = ref('')
const mapElement = ref<HTMLElement | null>(null)
const address = ref('')
let map: google.maps.Map | undefined
let marker: google.maps.marker.AdvancedMarkerElement | undefined
let advancedMarkerConstructor: typeof google.maps.marker.AdvancedMarkerElement | undefined
let geocoder: google.maps.Geocoder | undefined
let otherMarkers: google.maps.marker.AdvancedMarkerElement[] = []
let radiusCircle: google.maps.Circle | undefined

function markerContent(imageUrl: string, size: number, borderColor: string): HTMLElement {
  const element = document.createElement('div')
  element.style.width = `${size}px`
  element.style.height = `${size}px`
  element.style.display = 'grid'
  element.style.placeItems = 'center'
  element.style.overflow = 'hidden'
  element.style.border = `3px solid ${borderColor}`
  element.style.borderRadius = '50%'
  element.style.background = '#5f8a67'
  element.style.boxSizing = 'border-box'
  element.style.boxShadow = '0 2px 5px rgba(23, 60, 50, .3)'
  if (imageUrl) {
    const image = document.createElement('img')
    image.src = imageUrl
    image.alt = ''
    image.style.width = '100%'
    image.style.height = '100%'
    image.style.objectFit = 'cover'
    element.appendChild(image)
  }
  return element
}

async function loadMap() {
  if (!googleMapsKey || !mapElement.value) return
  try {
    const { Map } = await importLibrary('maps') as google.maps.MapsLibrary
    const { Geocoder } = await importLibrary('geocoding') as google.maps.GeocodingLibrary
    const { AdvancedMarkerElement } = await importLibrary('marker') as google.maps.MarkerLibrary
    advancedMarkerConstructor = AdvancedMarkerElement
    geocoder = new Geocoder()

    const center = { lat: props.latitude, lng: props.longitude }
    map = new Map(mapElement.value, {
      center,
      zoom: 14,
      mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: props.interactive ? 'greedy' : 'cooperative',
    })
    marker = new AdvancedMarkerElement({ map, position: center, gmpDraggable: props.interactive, title: 'Ubicación del reporte', content: markerContent("https://cdn-icons-png.flaticon.com/512/14665/14665484.png", 65, '#5f8a67') }) // SI DEJA DE FUNCIONAR EL ICONO DEL MARKER HE AQUI EL RESPONSABLE
    if (props.interactive) {
      marker.addListener('dragend', () => updateLocation(marker?.position))
    }
    renderOtherMarkers()
    renderRadiusCircle()
    
  } catch {
    mapError.value = 'No se pudo cargar Google Maps. Revisa la API key, facturación y APIs habilitadas.'
  }
}
function renderOtherMarkers() {
  if (!map || !advancedMarkerConstructor) return
  const AdvancedMarkerElement = advancedMarkerConstructor
  otherMarkers.forEach(m => { m.map = null })
  otherMarkers = []
  props.otherMarkers?.forEach((other) => {
    const otherMarker = new AdvancedMarkerElement({
      map,
      position: { lat: other.latitude, lng: other.longitude },
      title: other.name,
      content: markerContent(other.image, 48, '#9ca3af')
    })
    otherMarkers.push(otherMarker)
  })
}
function renderRadiusCircle() {
  if (radiusCircle) { radiusCircle.setMap(null); radiusCircle = undefined }
  if (!map) return
  if (!props.radiusMeters) { map.setZoom(14); return }
  radiusCircle = new google.maps.Circle({ map, center: { lat: props.latitude, lng: props.longitude }, radius: props.radiusMeters, fillColor: '#5f8a67', fillOpacity: 0.1, strokeColor: '#5f8a67', strokeOpacity: 0.6, strokeWeight: 2 })
  const bounds = radiusCircle.getBounds()
  if (bounds) map.fitBounds(bounds)
}
function updateMarkerIcon() {
  if (!marker) return
  marker.content = markerContent(props.imageUrl, 56, '#5f8a67')
}
function updateLocation(position: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined) {
  if (!position) return
  const latitude = typeof position.lat === 'function' ? position.lat() : position.lat
  const longitude = typeof position.lng === 'function' ? position.lng() : position.lng
  geocoder?.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
    address.value = status === 'OK' && results?.[0] ? results[0].formatted_address : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
    emit('locationChange', { latitude, longitude, address: address.value })
  })
}
watch(() => [props.latitude, props.longitude], ([latitude, longitude]) => { if (map && marker && latitude && longitude) { const position = { lat: latitude, lng: longitude }; map.setCenter(position); marker.position = position; if (radiusCircle) radiusCircle.setCenter(position) } })
watch(() => props.imageUrl, updateMarkerIcon)
watch(() => props.otherMarkers, renderOtherMarkers, { deep: true })
watch(() => props.radiusMeters, renderRadiusCircle)
onMounted(loadMap)
</script>

<template>
  <div class="google-map-wrap"><div ref="mapElement" class="google-map" :style="{ height }" /><div v-if="!hasApiKey" class="map-config-message">Configura `VITE_GOOGLE_MAPS_API_KEY` para activar Google Maps.</div><div v-else-if="mapError" class="map-config-message">{{ mapError }}</div><small v-if="address" class="map-address">{{ address }}</small></div>
</template>