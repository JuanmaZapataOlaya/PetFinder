import { nextTick, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter, type RouteRecordName } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'

interface TutorialStep {
  translationKey: string
  element: string
  route: RouteRecordName
}

const tutorialSteps: TutorialStep[] = [
  {
    translationKey: 'summary',
    element: '[data-tutorial="summary"]',
    route: 'summary',
  },
  {
    translationKey: 'explore',
    element: '[data-tutorial="explore-search"]',
    route: 'explore',
  },
  {
    translationKey: 'matches',
    element: '[data-tutorial="match-filters"]',
    route: 'explore',
  },
  {
    translationKey: 'reports',
    element: '[data-tutorial="reports"]',
    route: 'reports',
  },
  {
    translationKey: 'notifications',
    element: '[data-tutorial="notifications"]',
    route: 'Notifications',
  },
  {
    translationKey: 'petHistory',
    element: '[data-tutorial="pet-history"]',
    route: 'PetHistory',
  },
  {
    translationKey: 'personalInfo',
    element: '[data-tutorial="personal-info"]',
    route: 'ContactInfo',
  },
  {
    translationKey: 'repeat',
    element: '[data-tutorial="repeat-tutorial"]',
    route: 'summary',
  },
]

const maximumTutorialDuration = 55_000

export function useTutorial() {
  const route = useRoute()
  const router = useRouter()
  const { t } = useI18n()
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
        console.error(`No se pudo abrir la sección "${t(`tutorial.steps.${step.translationKey}.title`)}" del tutorial.`, error)
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
      nextBtnText: t('tutorial.next'),
      prevBtnText: t('tutorial.previous'),
      doneBtnText: t('tutorial.finish'),
      progressText: t('tutorial.progress', { current: '{{current}}', total: '{{total}}' }),
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
      steps: tutorialSteps.map(({ translationKey, element }) => ({
        element,
        popover: {
          title: t(`tutorial.steps.${translationKey}.title`),
          description: t(`tutorial.steps.${translationKey}.description`),
        },
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
