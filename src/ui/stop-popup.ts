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

const STAR_OUTLINE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
const STAR_FILLED = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`

export function createStopPopupContent(name: string, isFavorite = false): string {
  const starSvg = isFavorite ? STAR_FILLED : STAR_OUTLINE
  const activeClass = isFavorite ? ' favorite-star--active' : ''
  return `<div class="stop-popup">
    <div class="stop-popup__header">
      <div class="stop-popup__name">${name}</div>
      <span class="favorite-star stop-popup__favorite${activeClass}" role="button" tabindex="0" aria-label="${isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}" aria-pressed="${isFavorite}" data-stop-favorite-toggle="true">${starSvg}</span>
    </div>
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
