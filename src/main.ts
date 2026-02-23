import 'maplibre-gl/dist/maplibre-gl.css'
import { createMap } from './map/create-map'
import { initVehicleLayer, updateVehicleLayer, setupVehiclePopup } from './map/vehicle-layer'
import { initStopLayer, updateStopLayer } from './map/stop-layer'
import { initRouteLayer, updateRouteLayer } from './map/route-layer'
import {
  createStore,
  setVehicles,
  setLines,
  setStops,
  setRoutePaths,
  setTripShapesData,
  setLoading,
  setFavoriteLines,
  getFilteredVehicles,
  getFilteredRoutePaths,
  getFilteredStops,
} from './state'
import { fetchVehicles, fetchLines, fetchStops, fetchRoutePaths, fetchTripShapes } from './services/api'
import { createPollingService } from './services/polling'
import { loadFavorites, saveFavorites } from './services/favorites-storage'
import { createFilterPanel } from './ui/filter-panel'
import { createLoadingIndicator } from './ui/loading'
import { createRefreshTimer } from './ui/refresh-timer'
import { POLLING_INTERVAL } from './config'

function init(): void {
  const store = createStore()
  const map = createMap('map')

  const loadingContainer = document.getElementById('loading')
  const uiRoot = document.getElementById('ui-root')

  if (!loadingContainer || !uiRoot) {
    return
  }

  const loading = createLoadingIndicator(loadingContainer)
  const refreshTimer = createRefreshTimer(loadingContainer, POLLING_INTERVAL)

  map.on('load', () => {
    initRouteLayer(map)
    initVehicleLayer(map)
    setupVehiclePopup(map)
    initStopLayer(map, store)

    createFilterPanel(uiRoot, store)

    store.subscribe((state) => {
      const filteredVehicles = getFilteredVehicles(state)
      updateVehicleLayer(map, filteredVehicles)

      const filteredRoutes = getFilteredRoutePaths(state)
      updateRouteLayer(map, filteredRoutes)

      const filteredStops = getFilteredStops(state)
      updateStopLayer(map, filteredStops)
    })

    async function refreshVehicles(): Promise<void> {
      store.setState(setLoading(true))
      loading.show()

      try {
        const vehicles = await fetchVehicles()
        store.setState(setVehicles(vehicles))
        refreshTimer.reset()
      } catch (_error) {
        // Will retry on next polling interval
      } finally {
        store.setState(setLoading(false))
        loading.hide()
      }
    }

    async function loadInitialData(): Promise<void> {
      const [lines, stops, routePaths, tripShapesData] = await Promise.all([
        fetchLines(),
        fetchStops(),
        fetchRoutePaths(),
        fetchTripShapes(),
      ])
      store.setState(setLines(lines))
      store.setState(setStops(stops))
      store.setState(setRoutePaths(routePaths))
      store.setState(setTripShapesData(tripShapesData))
    }

    const storedFavorites = loadFavorites()
    if (storedFavorites.size > 0) {
      store.setState(setFavoriteLines(storedFavorites))
      store.setState((state) => ({ ...state, selectedLines: new Set(state.favoriteLines) }))
    }

    let prevFavorites = store.getState().favoriteLines
    store.subscribe((state) => {
      if (state.favoriteLines !== prevFavorites) {
        prevFavorites = state.favoriteLines
        saveFavorites(state.favoriteLines)
      }
    })

    const polling = createPollingService(refreshVehicles)

    loadInitialData()
      .then(() => {
        polling.start()
      })
      .catch(() => {
        polling.start()
      })

    map.on('moveend', async () => {
      const bounds = map.getBounds()
      const zoom = map.getZoom()

      if (zoom >= 14) {
        try {
          const stops = await fetchStops({
            minLng: bounds.getWest(),
            minLat: bounds.getSouth(),
            maxLng: bounds.getEast(),
            maxLat: bounds.getNorth(),
          })
          store.setState(setStops(stops))
        } catch (_error) {
          // Silently ignore stop loading errors
        }
      }
    })
  })
}

init()
