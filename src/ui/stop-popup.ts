import type { StopArrival } from '../types'

interface ArrivalGroup {
  readonly lineName: string
  readonly direction: 'A' | 'B'
  readonly lineColor: string
  readonly headsign: string
  readonly arrivals: readonly StopArrival[]
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
  if (minutes === 0) {
    return '<1 min'
  }
  return `${minutes} min`
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
      arrivals: [...g.arrivals].sort((a, b) => a.arrivalMinutes - b.arrivalMinutes),
    }))
    .sort((a, b) => a.arrivals[0].arrivalMinutes - b.arrivals[0].arrivalMinutes)
}

function renderTime(arrival: StopArrival): string {
  const rtBadge = arrival.isRealTime
    ? '<span class="stop-arrival__rt">RT</span>'
    : ''
  return `<span class="stop-arrival__time">${formatMinutes(arrival.arrivalMinutes)}${rtBadge}</span>`
}

function renderGroup(group: ArrivalGroup): string {
  const times = group.arrivals.map(renderTime).join('')
  const displayName = formatDisplayName(group.lineName, group.direction)

  return `<div class="stop-arrival__group">
    <div class="stop-arrival__header">
      <span class="stop-arrival__line" style="background-color: ${group.lineColor};">${displayName}</span>
      <span class="stop-arrival__direction">${group.headsign}</span>
    </div>
    <div class="stop-arrival__times">${times}</div>
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
