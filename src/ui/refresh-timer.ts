export interface RefreshTimer {
  reset(): void
  destroy(): void
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

  let secondsLeft = Math.round(intervalMs / 1000)
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
      if (secondsLeft > 0) {
        secondsLeft = secondsLeft - 1
      }
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
      secondsLeft = Math.round(intervalMs / 1000)
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
