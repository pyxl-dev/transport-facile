import maplibregl from 'maplibre-gl'
import type { Store } from '../state'
import type { Stop } from '../types'
import { SEARCH_MIN_CHARS, SEARCH_MAX_RESULTS, SEARCH_FLY_ZOOM } from '../config'
import { openStopPopup } from '../map/stop-popup-opener'

const SEARCH_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function getLineBadgesHtml(stop: Stop, store: Store): string {
  const state = store.getState()
  const lineMap = new Map(state.lines.map((l) => [l.id, l]))
  return stop.routeIds
    .map((routeId) => {
      const line = lineMap.get(routeId)
      if (!line) return ''
      return `<span class="search-bar__line-badge" style="background-color: ${line.color};">${line.name}</span>`
    })
    .filter(Boolean)
    .join('')
}

export function createSearchBar(
  container: HTMLElement,
  store: Store,
  map: maplibregl.Map,
): void {
  const wrapper = document.createElement('div')
  wrapper.className = 'search-bar'

  const icon = document.createElement('span')
  icon.className = 'search-bar__icon'
  icon.innerHTML = SEARCH_ICON_SVG

  const input = document.createElement('input')
  input.className = 'search-bar__input'
  input.type = 'text'
  input.placeholder = 'Rechercher un arrêt...'
  input.setAttribute('autocomplete', 'off')
  input.setAttribute('autocorrect', 'off')
  input.setAttribute('spellcheck', 'false')

  const clearBtn = document.createElement('button')
  clearBtn.className = 'search-bar__clear'
  clearBtn.innerHTML = '&times;'
  clearBtn.setAttribute('aria-label', 'Effacer la recherche')
  clearBtn.hidden = true

  const results = document.createElement('div')
  results.className = 'search-bar__results'
  results.hidden = true

  wrapper.appendChild(icon)
  wrapper.appendChild(input)
  wrapper.appendChild(clearBtn)
  wrapper.appendChild(results)
  container.appendChild(wrapper)

  const hasStops = store.getState().allStops.length > 0
  input.disabled = !hasStops
  if (!hasStops) {
    input.placeholder = 'Chargement des arrêts...'
  }

  store.subscribe((state) => {
    if (state.allStops.length > 0 && input.disabled) {
      input.disabled = false
      input.placeholder = 'Rechercher un arrêt...'
    }
  })

  function closeResults(): void {
    results.hidden = true
    results.innerHTML = ''
  }

  function clearInput(): void {
    input.value = ''
    clearBtn.hidden = true
    closeResults()
  }

  function renderResults(stops: readonly Stop[]): void {
    results.innerHTML = ''

    if (stops.length === 0) {
      results.innerHTML = '<div class="search-bar__empty">Aucun résultat</div>'
      results.hidden = false
      return
    }

    for (const stop of stops) {
      const item = document.createElement('div')
      item.className = 'search-bar__result'

      const nameEl = document.createElement('span')
      nameEl.className = 'search-bar__result-name'
      nameEl.textContent = stop.name

      const linesEl = document.createElement('span')
      linesEl.className = 'search-bar__result-lines'
      linesEl.innerHTML = getLineBadgesHtml(stop, store)

      item.appendChild(nameEl)
      item.appendChild(linesEl)

      item.addEventListener('click', () => {
        const coords: [number, number] = [stop.position.lng, stop.position.lat]
        store.setState((state) => ({ ...state, selectedLines: new Set(stop.routeIds) }))
        map.flyTo({ center: coords, zoom: SEARCH_FLY_ZOOM })
        openStopPopup(map, store, coords, stop.name, stop.stopId, stop.stopIds, { skipLineFilter: true })
        clearInput()
      })

      results.appendChild(item)
    }

    results.hidden = false
  }

  input.addEventListener('input', () => {
    const text = input.value.trim()
    clearBtn.hidden = text.length === 0

    if (text.length < SEARCH_MIN_CHARS) {
      closeResults()
      return
    }

    const normalizedQuery = normalizeText(text)
    const stops = store.getState().allStops
    const seenNames = new Set<string>()
    const matches = stops
      .filter((s) => {
        const norm = normalizeText(s.name)
        if (!norm.includes(normalizedQuery)) return false
        if (seenNames.has(norm)) return false
        seenNames.add(norm)
        return true
      })
      .slice(0, SEARCH_MAX_RESULTS)

    renderResults(matches)
  })

  clearBtn.addEventListener('click', () => {
    clearInput()
    input.focus()
  })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeResults()
      input.blur()
    }
  })

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target as Node)) {
      closeResults()
    }
  })
}
