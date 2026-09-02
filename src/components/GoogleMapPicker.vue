<script setup lang="ts">
/// <reference types="google.maps" />
import { onMounted, ref, watch } from 'vue'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

const props = withDefaults(defineProps<{ latitude?: number; longitude?: number; height?: string; interactive?: boolean; imageUrl?: string; otherMarkers?: Array<{ latitude: number; longitude: number; image: string; name: string }>; radiusMeters?: number }>(), { latitude: 19.4326, longitude: -99.1332, height: '250px', interactive: true, imageUrl: '', otherMarkers: () => [], radiusMeters: 0 })
const emit = defineEmits<{ locationChange: [location: { latitude: number; longitude: number; address: string }] }>()
const hasApiKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
const mapError = ref('')
const mapElement = ref<HTMLElement | null>(null)
const address = ref('')
let map: google.maps.Map | undefined
let marker: google.maps.Marker | undefined
let geocoder: google.maps.Geocoder | undefined
let otherMarkers: google.maps.Marker[] = []
let radiusCircle: google.maps.Circle | undefined

async function loadMap() {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!key || !mapElement.value) return
  try {
    setOptions({ key, v: 'weekly' })
    const { Map } = await importLibrary('maps') as google.maps.MapsLibrary
    const { Geocoder } = await importLibrary('geocoding') as google.maps.GeocodingLibrary
    geocoder = new Geocoder()
    const center = { lat: props.latitude, lng: props.longitude }
    map = new Map(mapElement.value, {
      center,
      zoom: 14,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: props.interactive ? 'greedy' : 'cooperative',
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#e7ece5' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#53655b' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#e7ece5' }] },
        { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#b9c8ba' }] },
        { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#dce7da' }] },
        { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#d4e0d2' }] },
        { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#718475' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f5f7f3' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#c5d0c4' }] },
        { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#718078' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cbdad0' }] },
        { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#60766b' }] },
      ],
    })
    marker = new google.maps.Marker({ map, position: center, draggable: props.interactive, title: 'Ubicación del reporte', icon: props.imageUrl ? { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><defs><clipPath id="photo"><circle cx="28" cy="28" r="23"/></clipPath></defs><circle cx="28" cy="28" r="27" fill="white"/><image href="${props.imageUrl}" width="56" height="56" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/><circle cx="28" cy="28" r="23" fill="none" stroke="#5f8a67" stroke-width="3"/></svg>`)}`, scaledSize: new google.maps.Size(56, 56), anchor: new google.maps.Point(28, 28) } : { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#5f8a67', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 } })
    if (props.interactive) {
      if (props.interactive) marker.addListener('dragend', () => updateLocation(marker?.getPosition()))
    }
    renderOtherMarkers()
    renderRadiusCircle()
  } catch {
    mapError.value = 'No se pudo cargar Google Maps. Revisa la API key, facturación y APIs habilitadas.'
  }
}
function renderOtherMarkers() {
  if (!map) return
  otherMarkers.forEach(m => m.setMap(null))
  otherMarkers = []
  props.otherMarkers?.forEach((other) => {
    const otherMarker = new google.maps.Marker({
      map,
      position: { lat: other.latitude, lng: other.longitude },
      draggable: false,
      title: other.name,
      icon: {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 56 56"><defs><clipPath id="photo"><circle cx="28" cy="28" r="20"/></clipPath></defs><circle cx="28" cy="28" r="24" fill="white" opacity="0.8"/><image href="${other.image}" width="56" height="56" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/><circle cx="28" cy="28" r="20" fill="none" stroke="#9ca3af" stroke-width="2"/></svg>`)}`,
        scaledSize: new google.maps.Size(48, 48),
        anchor: new google.maps.Point(24, 24)
      }
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
  marker.setIcon(props.imageUrl ? { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><defs><clipPath id="photo"><circle cx="28" cy="28" r="23"/></clipPath></defs><circle cx="28" cy="28" r="27" fill="white"/><image href="${props.imageUrl}" width="56" height="56" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/><circle cx="28" cy="28" r="23" fill="none" stroke="#5f8a67" stroke-width="3"/></svg>`)}`, scaledSize: new google.maps.Size(56, 56), anchor: new google.maps.Point(28, 28) } : { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#5f8a67', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 })
}
function updateLocation(position: google.maps.LatLng | null | undefined) {
  if (!position) return
  const latitude = position.lat(); const longitude = position.lng()
  geocoder?.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
    address.value = status === 'OK' && results?.[0] ? results[0].formatted_address : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
    emit('locationChange', { latitude, longitude, address: address.value })
  })
}
watch(() => [props.latitude, props.longitude], ([latitude, longitude]) => { if (map && marker && latitude && longitude) { const position = { lat: latitude, lng: longitude }; map.setCenter(position); marker.setPosition(position); if (radiusCircle) radiusCircle.setCenter(position) } })
watch(() => props.imageUrl, updateMarkerIcon)
watch(() => props.otherMarkers, renderOtherMarkers, { deep: true })
watch(() => props.radiusMeters, renderRadiusCircle)
onMounted(loadMap)
</script>

<template>
  <div class="google-map-wrap"><div ref="mapElement" class="google-map" :style="{ height }" /><div v-if="!hasApiKey" class="map-config-message">Configura `VITE_GOOGLE_MAPS_API_KEY` para activar Google Maps.</div><div v-else-if="mapError" class="map-config-message">{{ mapError }}</div><small v-if="address" class="map-address">{{ address }}</small></div>
</template>