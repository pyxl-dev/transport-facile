import type { StopArrival } from '../types'

interface DeduplicatedArrival {
  readonly minutes: number
  readonly isRealTime: boolean
}

interface ArrivalGroup {
  readonly lineName: string
  readonly direction: 'A' | 'B'
  readonly lineColor: string
  readonly headsign: string
  readonly arrivals: readonly DeduplicatedArrival[]
}

function stripTramPrefix(lineName: string): string {
  return lineName.startsWith('T') ? lineName.slice(1) : lineName
}

function isLineT4(lineName: string): boolean {
  return lineName === 'T4'
}

function formatDisplayName(lineName: string, direction: 'A' | 'B'): string {
  const base = stripTramPrefix(lineName)
  return isLineT4(lineName) ? `${base}${direction}` : base
}

function formatMinutes(minutes: number): string {
  return minutes === 0 ? '<1\u2032' : `${minutes}\u2032`
}

function deduplicateArrivals(arrivals: readonly StopArrival[]): readonly DeduplicatedArrival[] {
  const sorted = [...arrivals].sort((a, b) => a.arrivalMinutes - b.arrivalMinutes)
  const seen = new Set<number>()
  const result: DeduplicatedArrival[] = []

  for (const arrival of sorted) {
    if (seen.has(arrival.arrivalMinutes)) {
      // If duplicate minute, upgrade existing to RT if this one is RT
      if (arrival.isRealTime) {
        const existing = result.find((r) => r.minutes === arrival.arrivalMinutes)
        if (existing && !existing.isRealTime) {
          const idx = result.indexOf(existing)
          result[idx] = { minutes: existing.minutes, isRealTime: true }
        }
      }
      continue
    }
    seen.add(arrival.arrivalMinutes)
    result.push({ minutes: arrival.arrivalMinutes, isRealTime: arrival.isRealTime })
  }

  return result
}

function groupArrivals(arrivals: readonly StopArrival[]): readonly ArrivalGroup[] {
  const groupMap = new Map<string, { lineName: string; direction: 'A' | 'B'; lineColor: string; headsign: string; arrivals: StopArrival[] }>()

  for (const arrival of arrivals) {
    const key = isLineT4(arrival.lineName)
      ? `${arrival.lineName}::${arrival.direction}`
      : `${arrival.lineName}::${arrival.headsign}`
    const existing = groupMap.get(key)
    if (existing) {
      existing.arrivals.push(arrival)
    } else {
      groupMap.set(key, {
        lineName: arrival.lineName,
        direction: arrival.direction,
        lineColor: arrival.lineColor,
        headsign: arrival.headsign,
        arrivals: [arrival],
      })
    }
  }

  return Array.from(groupMap.values())
    .map((g) => ({
      ...g,
      arrivals: deduplicateArrivals(g.arrivals),
    }))
    .sort((a, b) => a.arrivals[0].minutes - b.arrivals[0].minutes)
}

const MAX_LATER_ARRIVALS = 3

function formatNextArrival(arrival: DeduplicatedArrival): string {
  const minutes = arrival.minutes === 0 ? '<1' : `${arrival.minutes}`
  return `<span class="stop-arrival__next">${minutes}<span class="stop-arrival__unit">min</span></span>`
}

function formatLaterArrivals(arrivals: readonly DeduplicatedArrival[]): string {
  if (arrivals.length === 0) return ''
  const visible = arrivals.slice(0, MAX_LATER_ARRIVALS)
  const hiddenCount = arrivals.length - visible.length
  const times = visible.map((a) => a.minutes === 0 ? '<1' : `${a.minutes}`).join(', ')
  const overflow = hiddenCount > 0
    ? `<span class="stop-arrival__more">+${hiddenCount}</span>`
    : ''
  return `<div class="stop-arrival__later">puis ${times} min${overflow}</div>`
}

function renderGroup(group: ArrivalGroup): string {
  const displayName = formatDisplayName(group.lineName, group.direction)
  const [first, ...rest] = group.arrivals
  const nextArrival = first ? formatNextArrival(first) : ''
  const laterArrivals = formatLaterArrivals(rest)

  return `<div class="stop-arrival__group">
    <div class="stop-arrival__main">
      <span class="stop-arrival__line" style="background-color: ${group.lineColor};">${displayName}</span>
      <span class="stop-arrival__headsign">${group.headsign}</span>
      ${nextArrival}
    </div>
    ${laterArrivals}
  </div>`
}

export function createStopPopupContent(name: string): string {
  return `<div class="stop-popup">
    <div class="stop-popup__name">${name}</div>
    <div class="stop-popup__arrivals" id="stop-arrivals-content">
      <div class="stop-popup__loading">Chargement...</div>
    </div>
  </div>`
}

export function renderArrivals(arrivals: readonly StopArrival[]): string {
  if (arrivals.length === 0) {
    return '<div class="stop-popup__empty">Aucun passage prevu</div>'
  }

  const groups = groupArrivals(arrivals)
  return `<div class="stop-arrival__list">${groups.map(renderGroup).join('')}</div>`
}
