import { POLLING_INTERVAL } from '../config'

export interface PollingService {
  start(): void
  stop(): void
  isRunning(): boolean
  forceRefresh(): void
}

function computeDelay(interval: number): number {
  const remainder = Date.now() % interval
  return remainder === 0 ? interval : interval - remainder
}

export function createPollingService(
  callback: () => Promise<void>,
  interval: number = POLLING_INTERVAL
): PollingService {
  let timerId: ReturnType<typeof setTimeout> | null = null
  let running = false

  async function execute(): Promise<void> {
    try {
      await callback()
    } catch (_error) {
      // Silently ignore polling errors - will retry on next interval
    }
  }

  function scheduleNext(): void {
    timerId = setTimeout(() => {
      if (!running) return
      scheduleNext()
      execute()
    }, computeDelay(interval))
  }

  return {
    start() {
      if (running) return
      running = true
      execute()
      scheduleNext()
    },

    stop() {
      if (!running) return
      running = false
      if (timerId !== null) {
        clearTimeout(timerId)
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
