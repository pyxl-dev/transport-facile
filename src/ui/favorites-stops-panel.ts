import type maplibregl from 'maplibre-gl'
import type { Store } from '../state'
import { removeFavoriteStop } from '../state'
import type { FavoriteStop } from '../types'
import { SEARCH_FLY_ZOOM } from '../config'
import { openStopPopup } from '../map/stop-popup-opener'

const STAR_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`

function renderFavoriteItem(
  fav: FavoriteStop,
  store: Store,
  map: maplibregl.Map,
  closePanel: () => void,
): HTMLDivElement {
  const item = document.createElement('div')
  item.className = 'favorites-stops-item'

  const nameEl = document.createElement('span')
  nameEl.className = 'favorites-stops-item__name'
  nameEl.textContent = fav.name

  const removeBtn = document.createElement('button')
  removeBtn.className = 'favorites-stops-item__remove'
  removeBtn.innerHTML = '&times;'
  removeBtn.setAttribute('aria-label', `Retirer ${fav.name} des favoris`)

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    store.setState(removeFavoriteStop(fav.stopId))
  })

  item.addEventListener('click', () => {
    const coords: [number, number] = [fav.position.lng, fav.position.lat]
    const matchingStop = store.getState().allStops.find((s) => s.stopId === fav.stopId)
    if (matchingStop) {
      store.setState((state) => ({ ...state, selectedLines: new Set(matchingStop.routeIds) }))
    }
    map.flyTo({ center: coords, zoom: SEARCH_FLY_ZOOM })
    openStopPopup(map, store, coords, fav.name, fav.stopId, fav.stopIds, { skipLineFilter: true })
    closePanel()
  })

  item.appendChild(nameEl)
  item.appendChild(removeBtn)
  return item
}

export function createFavoritesStopsPanel(
  container: HTMLElement,
  store: Store,
  map: maplibregl.Map,
): void {
  const toggleButton = document.createElement('button')
  toggleButton.className = 'favorites-stops-toggle'
  toggleButton.innerHTML = STAR_ICON_SVG
  toggleButton.setAttribute('aria-label', 'Arrêts favoris')

  const badge = document.createElement('span')
  badge.className = 'favorites-stops-badge'
  badge.hidden = true
  toggleButton.appendChild(badge)

  const overlay = document.createElement('div')
  overlay.className = 'favorites-stops-overlay'

  const panel = document.createElement('div')
  panel.className = 'favorites-stops-panel'

  const listContainer = document.createElement('div')
  listContainer.className = 'favorites-stops-list'
  panel.appendChild(listContainer)

  function closePanel(): void {
    panel.classList.remove('open')
    overlay.classList.remove('active')
  }

  function togglePanel(): void {
    const isOpen = panel.classList.contains('open')
    panel.classList.toggle('open', !isOpen)
    overlay.classList.toggle('active', !isOpen)
  }

  function renderList(favorites: readonly FavoriteStop[]): void {
    listContainer.innerHTML = ''
    if (favorites.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'favorites-stops-empty'
      empty.textContent = 'Aucun favori'
      listContainer.appendChild(empty)
      return
    }

    for (const fav of favorites) {
      const item = renderFavoriteItem(fav, store, map, closePanel)
      listContainer.appendChild(item)
    }
  }

  function updateBadge(count: number): void {
    if (count > 0) {
      badge.textContent = String(count)
      badge.hidden = false
    } else {
      badge.hidden = true
    }
  }

  toggleButton.addEventListener('click', togglePanel)
  overlay.addEventListener('click', closePanel)

  container.appendChild(toggleButton)
  container.appendChild(overlay)
  container.appendChild(panel)

  store.subscribe((state) => {
    renderList(state.favoriteStops)
    updateBadge(state.favoriteStops.length)
  })

  const currentState = store.getState()
  renderList(currentState.favoriteStops)
  updateBadge(currentState.favoriteStops.length)
}
