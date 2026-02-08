import 'maplibre-gl/dist/maplibre-gl.css'
import { createMap } from './map/create-map'
import { initVehicleLayer, updateVehicleLayer, setupVehiclePopup } from './map/vehicle-layer'
import { initStopLayer, updateStopLayer } from './map/stop-layer'
import { createStore, setVehicles, setLines, setStops, setLoading, getFilteredVehicles } from './state'
import { fetchVehicles, fetchLines, fetchStops } from './services/api'
import { createPollingService } from './services/polling'
import { createFilterPanel } from './ui/filter-panel'
import { createLoadingIndicator } from './ui/loading'

function init(): void {
  const store = createStore()
  const map = createMap('map')

  const loadingContainer = document.getElementById('loading')
  const uiRoot = document.getElementById('ui-root')

  if (!loadingContainer || !uiRoot) {
    return
  }

  const loading = createLoadingIndicator(loadingContainer)

  map.on('load', () => {
    initVehicleLayer(map)
    setupVehiclePopup(map)
    initStopLayer(map)

    createFilterPanel(uiRoot, store)

    store.subscribe((state) => {
      const filtered = getFilteredVehicles(state)
      updateVehicleLayer(map, filtered)
    })

    async function refreshVehicles(): Promise<void> {
      store.setState(setLoading(true))
      loading.show()

      try {
        const vehicles = await fetchVehicles()
        store.setState(setVehicles(vehicles))
      } catch (_error) {
        // Will retry on next polling interval
      } finally {
        store.setState(setLoading(false))
        loading.hide()
      }
    }

    async function loadInitialData(): Promise<void> {
      const [lines, stops] = await Promise.all([
        fetchLines(),
        fetchStops(),
      ])
      store.setState(setLines(lines))
      store.setState(setStops(stops))
      updateStopLayer(map, stops)
    }

    const polling = createPollingService(refreshVehicles)

    loadInitialData()
      .then(() => polling.start())
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
          updateStopLayer(map, stops)
        } catch (_error) {
          // Silently ignore stop loading errors
        }
      }
    })
  })
}

init()
