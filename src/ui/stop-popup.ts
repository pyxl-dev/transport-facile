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

function renderTime(arrival: DeduplicatedArrival, isFirst: boolean): string {
  const rtBadge = arrival.isRealTime
    ? '<span class="stop-arrival__rt">RT</span>'
    : ''
  const firstClass = isFirst ? ' stop-arrival__time--first' : ''
  return `<span class="stop-arrival__time${firstClass}">${formatMinutes(arrival.minutes)}${rtBadge}</span>`
}

function renderGroup(group: ArrivalGroup): string {
  const times = group.arrivals.map((a, i) => renderTime(a, i === 0)).join('')
  const displayName = formatDisplayName(group.lineName, group.direction)

  return `<div class="stop-arrival__row">
    <span class="stop-arrival__line" style="background-color: ${group.lineColor};">${displayName}</span>
    <span class="stop-arrival__headsign">${group.headsign}</span>
    <span class="stop-arrival__times">${times}</span>
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
