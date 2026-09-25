import { nextTick, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter, type RouteRecordName } from 'vue-router'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'

interface TutorialStep {
  title: string
  description: string
  element: string
  route: RouteRecordName
}

const tutorialSteps: TutorialStep[] = [
  {
    title: 'Resumen',
    description: 'Aquí encontrarás una vista general con la información más importante y la actividad reciente.',
    element: '[data-tutorial="summary"]',
    route: 'summary',
  },
  {
    title: 'Busca reportes',
    description: 'Escribe en la barra de búsqueda y filtra por especie o por reportes de mascotas perdidas o encontradas.',
    element: '[data-tutorial="explore-search"]',
    route: 'explore',
  },
  {
    title: 'Encuentra coincidencias',
    description: 'Usa los mismos filtros de especie y tipo de reporte. Elige un radio y mueve el marcador del mapa para buscar cerca de la ubicación que quieras, por ejemplo la tuya.',
    element: '[data-tutorial="match-filters"]',
    route: 'explore',
  },
  {
    title: 'Mis reportes',
    description: 'Accede rápidamente a los reportes que has creado o guardado.',
    element: '[data-tutorial="reports"]',
    route: 'reports',
  },
  {
    title: 'Notificaciones',
    description: 'Revisa alertas, novedades y actualizaciones importantes.',
    element: '[data-tutorial="notifications"]',
    route: 'Notifications',
  },
  {
    title: 'Historial de mascotas',
    description: 'Consulta la actividad y el historial de las mascotas reclamadas por la comunidad a través de la app.',
    element: '[data-tutorial="pet-history"]',
    route: 'PetHistory',
  },
  {
    title: 'Información personal',
    description: 'Administra y actualiza los datos de tu perfil.',
    element: '[data-tutorial="personal-info"]',
    route: 'ContactInfo',
  },
  {
    title: '¿Quieres otro paseo?',
    description: 'Si deseas otro paseo por la app aqui puedes solicitarlo',
    element: '[data-tutorial="repeat-tutorial"]',
    route: 'summary',
  },
]

const maximumTutorialDuration = 55_000

export function useTutorial() {
  const route = useRoute()
  const router = useRouter()
  const isConfirmationVisible = ref(false)
  let tutorialDriver: Driver | null = null
  let originalPath: string | null = null
  let durationTimer: ReturnType<typeof setTimeout> | undefined
  let isRestoringRoute = false
  let isTutorialActive = false

  function runTutorial() {
    if (isConfirmationVisible.value || tutorialDriver) return
    isConfirmationVisible.value = true
  }

  function closeTutorial() {
    isConfirmationVisible.value = false
    if (tutorialDriver) {
      tutorialDriver.destroy()
      return
    }
    void restoreOriginalRoute()
  }

  async function restoreOriginalRoute() {
    if (!originalPath || route.fullPath === originalPath || isRestoringRoute) return
    isRestoringRoute = true
    try {
      await router.push(originalPath)
    } catch (error) {
      console.error('No se pudo regresar a la página anterior al tutorial.', error)
    } finally {
      originalPath = null
      isRestoringRoute = false
    }
  }

  async function showAvailableStep(startIndex: number, direction: 1 | -1) {
    let index = startIndex
    while (index >= 0 && index < tutorialSteps.length) {
      if (!isTutorialActive) return
      const step = tutorialSteps[index]
      if (!step) break

      try {
        await router.push({ name: step.route })
      } catch (error) {
        console.error(`No se pudo abrir la sección "${step.title}" del tutorial.`, error)
        tutorialDriver?.destroy()
        return
      }
      if (!isTutorialActive) return
      await nextTick()
      if (document.querySelector(step.element)) {
        tutorialDriver?.drive(index)
        return
      }
      index += direction
    }
    tutorialDriver?.destroy()
  }

  function finishTutorial() {
    tutorialDriver?.destroy()
  }

  async function acceptTutorial() {
    isConfirmationVisible.value = false
    isTutorialActive = true
    originalPath = route.fullPath

    tutorialDriver = driver({
      animate: true,
      duration: 300,
      overlayColor: '#10251d',
      overlayOpacity: 0.72,
      smoothScroll: true,
      allowClose: true,
      allowKeyboardControl: true,
      overlayClickBehavior: 'close',
      stagePadding: 8,
      stageRadius: 12,
      showProgress: true,
      showButtons: ['previous', 'next', 'close'],
      nextBtnText: 'Siguiente',
      prevBtnText: 'Anterior',
      doneBtnText: 'Finalizar',
      progressText: 'Paso {{current}} de {{total}}',
      popoverClass: 'petfinder-tutorial-popover',
      onNextClick: (_element, _step, { state }) => {
        const currentIndex = state.activeIndex ?? -1
        void showAvailableStep(currentIndex + 1, 1)
      },
      onPrevClick: (_element, _step, { state }) => {
        const currentIndex = state.activeIndex ?? tutorialSteps.length
        void showAvailableStep(currentIndex - 1, -1)
      },
      onCloseClick: finishTutorial,
      onDoneClick: finishTutorial,
      onDestroyed: () => {
        isTutorialActive = false
        tutorialDriver = null
        if (durationTimer) clearTimeout(durationTimer)
        void restoreOriginalRoute()
      },
      steps: tutorialSteps.map(({ title, description, element }) => ({
        element,
        popover: { title, description },
      })),
    })

    durationTimer = setTimeout(finishTutorial, maximumTutorialDuration)
    await showAvailableStep(0, 1)
  }

  onBeforeUnmount(finishTutorial)

  return {
    isConfirmationVisible,
    runTutorial,
    acceptTutorial,
    closeTutorial,
  }
}
