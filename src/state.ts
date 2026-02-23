import type { AppState, Vehicle, LineInfo, Stop, RoutePath, TripShapesData } from './types'

const initialState: AppState = {
  vehicles: [],
  lines: [],
  stops: [],
  routePaths: [],
  tripShapesData: null,
  selectedLines: new Set<string>(),
  favoriteLines: new Set<string>(),
  isLoading: false,
  lastUpdated: null,
}

type Listener = (state: AppState) => void

export function createStore() {
  let state: AppState = initialState
  const listeners: Set<Listener> = new Set()

  function getState(): AppState {
    return state
  }

  function setState(updater: (prev: AppState) => AppState): void {
    state = updater(state)
    listeners.forEach((listener) => listener(state))
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { getState, setState, subscribe }
}

export type Store = ReturnType<typeof createStore>

export function setVehicles(
  vehicles: readonly Vehicle[]
): (state: AppState) => AppState {
  return (state) => ({ ...state, vehicles, lastUpdated: Date.now() })
}

export function setLines(
  lines: readonly LineInfo[]
): (state: AppState) => AppState {
  return (state) => ({ ...state, lines })
}

export function setStops(
  stops: readonly Stop[]
): (state: AppState) => AppState {
  return (state) => ({ ...state, stops })
}

export function setLoading(
  isLoading: boolean
): (state: AppState) => AppState {
  return (state) => ({ ...state, isLoading })
}

export function toggleLineFilter(
  lineId: string
): (state: AppState) => AppState {
  return (state) => {
    const newSelected = new Set(state.selectedLines)
    if (newSelected.has(lineId)) {
      newSelected.delete(lineId)
    } else {
      newSelected.add(lineId)
    }
    return { ...state, selectedLines: newSelected }
  }
}

export function clearLineFilter(): (state: AppState) => AppState {
  return (state) => ({ ...state, selectedLines: new Set<string>() })
}

export function setRoutePaths(
  routePaths: readonly RoutePath[]
): (state: AppState) => AppState {
  return (state) => ({ ...state, routePaths })
}

export function setTripShapesData(
  tripShapesData: TripShapesData
): (state: AppState) => AppState {
  return (state) => ({ ...state, tripShapesData })
}

export function toggleFavorite(
  lineId: string
): (state: AppState) => AppState {
  return (state) => {
    const newFavorites = new Set(state.favoriteLines)
    if (newFavorites.has(lineId)) {
      newFavorites.delete(lineId)
    } else {
      newFavorites.add(lineId)
    }
    return { ...state, favoriteLines: newFavorites }
  }
}

export function setFavoriteLines(
  lineIds: ReadonlySet<string>
): (state: AppState) => AppState {
  return (state) => ({ ...state, favoriteLines: new Set(lineIds) })
}

export function clearFavorites(): (state: AppState) => AppState {
  return (state) => ({ ...state, favoriteLines: new Set<string>() })
}

export function getFilteredVehicles(state: AppState): readonly Vehicle[] {
  if (state.selectedLines.size === 0) {
    return state.vehicles
  }
  return state.vehicles.filter((v) => state.selectedLines.has(v.line.id))
}

const PROXIMITY_THRESHOLD_SQ = 0.002 * 0.002 // ~200m at Montpellier latitude

function hasVehicleNearBranch(
  vehicles: readonly Vehicle[],
  routeId: string,
  coordinates: readonly (readonly [number, number])[]
): boolean {
  for (const vehicle of vehicles) {
    if (vehicle.line.id !== routeId) continue
    const vLng = vehicle.position.lng
    const vLat = vehicle.position.lat
    for (const [lng, lat] of coordinates) {
      const dLng = vLng - lng
      const dLat = vLat - lat
      if (dLng * dLng + dLat * dLat < PROXIMITY_THRESHOLD_SQ) {
        return true
      }
    }
  }
  return false
}

export function getFilteredRoutePaths(state: AppState): readonly RoutePath[] {
  const lineFiltered =
    state.selectedLines.size === 0
      ? state.routePaths
      : state.routePaths.filter((rp) => state.selectedLines.has(rp.routeId))

  if (!state.tripShapesData) {
    return lineFiltered
  }

  const { tripShapes, defaultShapes } = state.tripShapesData

  const activeShapesByRoute = new Map<string, Set<string>>()
  for (const vehicle of state.vehicles) {
    const shapeId = tripShapes[vehicle.tripId]
    if (!shapeId) continue
    const existing = activeShapesByRoute.get(vehicle.line.id)
    if (existing) {
      existing.add(shapeId)
    } else {
      activeShapesByRoute.set(vehicle.line.id, new Set([shapeId]))
    }
  }

  const vehiclesByRoute = new Map<string, boolean>()
  for (const vehicle of state.vehicles) {
    vehiclesByRoute.set(vehicle.line.id, true)
  }

  return lineFiltered.filter((rp) => {
    const isFallback = rp.shapeId.startsWith('fallback-')

    if (!isFallback) {
      const activeShapes = activeShapesByRoute.get(rp.routeId)
      if (activeShapes) {
        return activeShapes.has(rp.shapeId)
      }
      return rp.shapeId === defaultShapes[rp.routeId]
    }

    if (!vehiclesByRoute.has(rp.routeId)) {
      return true
    }
    return hasVehicleNearBranch(state.vehicles, rp.routeId, rp.coordinates)
  })
}

export function getFilteredStops(state: AppState): readonly Stop[] {
  const activeRouteIds = new Set(state.vehicles.map((v) => v.line.id))

  if (activeRouteIds.size === 0) {
    return []
  }

  const visibleRouteIds =
    state.selectedLines.size > 0
      ? new Set([...state.selectedLines].filter((id) => activeRouteIds.has(id)))
      : activeRouteIds

  return state.stops.filter((stop) =>
    stop.routeIds.some((routeId) => visibleRouteIds.has(routeId))
  )
}
