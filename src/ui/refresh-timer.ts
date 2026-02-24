export interface RefreshTimer {
  reset(): void
  destroy(): void
}

function computeSecondsUntilNextTick(intervalMs: number): number {
  const remainder = Date.now() % intervalMs
  const msUntilNext = remainder === 0 ? intervalMs : intervalMs - remainder
  return Math.ceil(msUntilNext / 1000)
}

export function createRefreshTimer(
  container: HTMLElement,
  intervalMs: number
): RefreshTimer {
  const el = document.createElement('div')
  el.className = 'last-updated'
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
  container.appendChild(el)

  let secondsLeft = computeSecondsUntilNextTick(intervalMs)
  let tickId: ReturnType<typeof setInterval> | null = null

  function render(): void {
    el.textContent =
      secondsLeft > 0
        ? `Mise \u00e0 jour dans ${secondsLeft}s`
        : 'Mise \u00e0 jour\u2026'
  }

  function startTick(): void {
    stopTick()
    tickId = setInterval(() => {
      secondsLeft = computeSecondsUntilNextTick(intervalMs)
      render()
    }, 1000)
  }

  function stopTick(): void {
    if (tickId !== null) {
      clearInterval(tickId)
      tickId = null
    }
  }

  return {
    reset() {
      secondsLeft = computeSecondsUntilNextTick(intervalMs)
      render()
      el.classList.add('visible')
      startTick()
    },

    destroy() {
      stopTick()
      el.remove()
    },
  }
}
