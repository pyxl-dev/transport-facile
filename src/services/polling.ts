import { POLLING_INTERVAL } from '../config'

export interface PollingService {
  start(): void
  stop(): void
  isRunning(): boolean
  forceRefresh(): void
}

export function createPollingService(
  callback: () => Promise<void>,
  interval: number = POLLING_INTERVAL
): PollingService {
  let timerId: ReturnType<typeof setInterval> | null = null
  let running = false

  async function execute(): Promise<void> {
    try {
      await callback()
    } catch (_error) {
      // Silently ignore polling errors - will retry on next interval
    }
  }

  return {
    start() {
      if (running) return
      running = true
      execute()
      timerId = setInterval(execute, interval)
    },

    stop() {
      if (!running) return
      running = false
      if (timerId !== null) {
        clearInterval(timerId)
        timerId = null
      }
    },

    isRunning() {
      return running
    },

    forceRefresh() {
      execute()
    },
  }
}
