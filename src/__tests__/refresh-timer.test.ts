// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRefreshTimer } from '../ui/refresh-timer'

describe('createRefreshTimer', () => {
  let container: HTMLElement

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('creates a .last-updated element inside container', () => {
    createRefreshTimer(container, 30_000)
    const el = container.querySelector('.last-updated')
    expect(el).not.toBeNull()
    expect(el?.getAttribute('role')).toBe('status')
  })

  it('is hidden initially (no .visible class)', () => {
    createRefreshTimer(container, 30_000)
    const el = container.querySelector('.last-updated')!
    expect(el.classList.contains('visible')).toBe(false)
  })

  it('becomes visible after first reset()', () => {
    const timer = createRefreshTimer(container, 30_000)
    timer.reset()
    const el = container.querySelector('.last-updated')!
    expect(el.classList.contains('visible')).toBe(true)
  })

  it('shows full countdown text after reset()', () => {
    const timer = createRefreshTimer(container, 30_000)
    timer.reset()
    const el = container.querySelector('.last-updated')!
    expect(el.textContent).toBe('Mise à jour dans 30s')
  })

  it('counts down each second', () => {
    const timer = createRefreshTimer(container, 10_000)
    timer.reset()
    const el = container.querySelector('.last-updated')!

    expect(el.textContent).toBe('Mise à jour dans 10s')

    vi.advanceTimersByTime(1000)
    expect(el.textContent).toBe('Mise à jour dans 9s')

    vi.advanceTimersByTime(4000)
    expect(el.textContent).toBe('Mise à jour dans 5s')
  })

  it('shows loading text when countdown reaches 0', () => {
    const timer = createRefreshTimer(container, 3_000)
    timer.reset()
    const el = container.querySelector('.last-updated')!

    vi.advanceTimersByTime(3000)
    expect(el.textContent).toBe('Mise à jour\u2026')
  })

  it('does not go below 0', () => {
    const timer = createRefreshTimer(container, 2_000)
    timer.reset()
    const el = container.querySelector('.last-updated')!

    vi.advanceTimersByTime(5000)
    expect(el.textContent).toBe('Mise à jour\u2026')
  })

  it('resets countdown on subsequent reset() calls', () => {
    const timer = createRefreshTimer(container, 10_000)
    timer.reset()
    const el = container.querySelector('.last-updated')!

    vi.advanceTimersByTime(7000)
    expect(el.textContent).toBe('Mise à jour dans 3s')

    timer.reset()
    expect(el.textContent).toBe('Mise à jour dans 10s')

    vi.advanceTimersByTime(2000)
    expect(el.textContent).toBe('Mise à jour dans 8s')
  })

  it('destroy() removes element and stops interval', () => {
    const timer = createRefreshTimer(container, 10_000)
    timer.reset()

    const el = container.querySelector('.last-updated')!
    expect(container.contains(el)).toBe(true)

    timer.destroy()

    expect(container.querySelector('.last-updated')).toBeNull()
    // Advancing timers should not throw after destroy
    vi.advanceTimersByTime(5000)
  })
})
