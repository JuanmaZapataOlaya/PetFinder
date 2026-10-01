import { shallowRef } from 'vue'

export type NotificationCommandAction = 'LIST' | 'MARK_READ' | 'MARK_UNREAD' | 'FINALIZE' | 'REPORT'

export interface NotificationCommandResult {
  status: 'ok' | 'error'
  message: string
  notifications?: Array<{ position: number; title: string; sender: string; read: boolean }>
}

export interface NotificationCommand {
  action: NotificationCommandAction
  position?: number
  reason?: string
  resolve: (result: NotificationCommandResult) => void
}

const COMMAND_TIMEOUT_MS = 10000

// The assistant queues the command and the notifications view executes it once its data is
// loaded, so the change is visible on screen and the view stays the single source of state.
const pendingCommand = shallowRef<NotificationCommand | null>(null)

export function useNotificationCommands() {
  function requestNotificationCommand(command: Omit<NotificationCommand, 'resolve'>): Promise<NotificationCommandResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingCommand.value = null
        resolve({ status: 'error', message: 'La página de notificaciones no respondió a tiempo.' })
      }, COMMAND_TIMEOUT_MS)
      pendingCommand.value = {
        ...command,
        resolve: (result) => {
          clearTimeout(timer)
          resolve(result)
        },
      }
    })
  }

  function takePendingCommand(): NotificationCommand | null {
    const command = pendingCommand.value
    pendingCommand.value = null
    return command
  }

  return { pendingCommand, requestNotificationCommand, takePendingCommand }
}
