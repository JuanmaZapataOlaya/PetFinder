# PetFinder Demo

Dashboard responsive para conectar reportes de mascotas perdidas y encontradas. Esta primera entrega implementa la experiencia principal del MVP con datos locales: resumen de actividad, filtros, búsqueda, coincidencias, mapa de actividad y alta de reportes.

## Arquitectura del frontend

```text
src/
├── components/   # piezas visuales reutilizables (Icon.vue)
├── data/         # fixtures y datos de demostración
├── styles/       # tokens y estilos globales responsive
├── types/        # contratos TypeScript del dominio
├── App.vue       # composición de la shell y estado de navegación
└── main.ts       # punto de entrada de Vue
```

## Desarrollo

```sh
npm install
npm run dev
```

## Google Maps

1. Copia `.env.example` como `.env.local`.
2. Crea una API key en Google Cloud y habilita `Maps JavaScript API`, `Places API` y `Geocoding API`.
3. Configura `VITE_GOOGLE_MAPS_API_KEY` en `.env.local`.

La clave debe restringirse por dominio/referrer en Google Cloud. En producción, la selección y validación de ubicaciones también debe pasar por el backend.

El backend, autenticación, persistencia, subida de imágenes y motor de coincidencias quedan preparados como siguientes módulos de la arquitectura descrita en `Instrucciones_Plan_Arquitectura.md`.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```
