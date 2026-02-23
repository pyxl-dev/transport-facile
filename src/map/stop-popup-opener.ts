import maplibregl from 'maplibre-gl'
import type { Store } from '../state'
import type { StopArrival, FavoriteStop } from '../types'
import { addFavoriteStop, removeFavoriteStop } from '../state'
import { createStopPopupContent, renderArrivals } from '../ui/stop-popup'
import { fetchStopArrivals } from '../services/api'

const STAR_OUTLINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
const STAR_FILLED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`

function getSelectedLineNames(store: Store): ReadonlySet<string> | null {
  const state = store.getState()
  if (state.selectedLines.size === 0) {
    return null
  }
  const lineMap = new Map(state.lines.map((l) => [l.id, l.name]))
  const names = new Set<string>()
  for (const routeId of state.selectedLines) {
    const name = lineMap.get(routeId)
    if (name) {
      names.add(name)
    }
  }
  return names
}

function filterArrivalsBySelectedLines(
  arrivals: readonly StopArrival[],
  selectedLineNames: ReadonlySet<string> | null,
): readonly StopArrival[] {
  if (!selectedLineNames) {
    return arrivals
  }
  return arrivals.filter((a) => selectedLineNames.has(a.lineName))
}

export interface StopPopupOptions {
  readonly skipLineFilter?: boolean
}

export function openStopPopup(
  map: maplibregl.Map,
  store: Store,
  coordinates: [number, number],
  stopName: string,
  stopId: string,
  stopIds: readonly string[],
  options?: StopPopupOptions,
): void {
  const isFavorite = store.getState().favoriteStops.some((s) => s.stopId === stopId)

  const popup = new maplibregl.Popup({ maxWidth: '320px' })
    .setLngLat(coordinates)
    .setHTML(createStopPopupContent(stopName, isFavorite))
    .addTo(map)

  const popupEl = popup.getElement()
  if (popupEl) {
    const starBtn = popupEl.querySelector('[data-stop-favorite-toggle]')
    if (starBtn) {
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const currentlyFav = store.getState().favoriteStops.some((s) => s.stopId === stopId)
        if (currentlyFav) {
          store.setState(removeFavoriteStop(stopId))
        } else {
          const favStop: FavoriteStop = {
            stopId,
            stopIds: [...stopIds],
            name: stopName,
            position: { lat: coordinates[1], lng: coordinates[0] },
          }
          store.setState(addFavoriteStop(favStop))
        }
        const nowFav = store.getState().favoriteStops.some((s) => s.stopId === stopId)
        starBtn.classList.toggle('favorite-star--active', nowFav)
        starBtn.innerHTML = nowFav ? STAR_FILLED_SVG : STAR_OUTLINE_SVG
        starBtn.setAttribute('aria-pressed', String(nowFav))
        starBtn.setAttribute('aria-label', nowFav ? 'Retirer des favoris' : 'Ajouter aux favoris')
      })
    }
  }

  const selectedLineNames = options?.skipLineFilter ? null : getSelectedLineNames(store)

  if (stopIds.length === 0) {
    const container = popup.getElement()?.querySelector('#stop-arrivals-content')
    if (container) {
      container.innerHTML = renderArrivals([])
    }
    return
  }

  Promise.all(stopIds.map((id) => fetchStopArrivals(id)))
    .then((results) => {
      const arrivals = filterArrivalsBySelectedLines(results.flat(), selectedLineNames)
      const container = popup.getElement()?.querySelector('#stop-arrivals-content')
      if (container) {
        container.innerHTML = renderArrivals(arrivals)
      }
    })
    .catch(() => {
      const container = popup.getElement()?.querySelector('#stop-arrivals-content')
      if (container) {
        container.innerHTML = '<div class="stop-popup__empty">Erreur de chargement</div>'
      }
    })
}
