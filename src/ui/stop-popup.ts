import type { StopArrival } from '../types'

function formatMinutes(minutes: number): string {
  if (minutes === 0) {
    return '<1 min'
  }
  return `${minutes} min`
}

function arrivalRow(arrival: StopArrival): string {
  const rtBadge = arrival.isRealTime
    ? '<span class="stop-arrival__rt">RT</span>'
    : ''

  return `<div class="stop-arrival__row">
    <span class="stop-arrival__line" style="background-color: ${arrival.lineColor};">${arrival.lineName}</span>
    <span class="stop-arrival__headsign">${arrival.headsign}</span>
    <span class="stop-arrival__time">${formatMinutes(arrival.arrivalMinutes)}${rtBadge}</span>
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

  return `<div class="stop-arrival__list">${arrivals.map(arrivalRow).join('')}</div>`
}
