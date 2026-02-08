import type { AppState, Vehicle, LineInfo, Stop, RoutePath } from './types'

const initialState: AppState = {
  vehicles: [],
  lines: [],
  stops: [],
  routePaths: [],
  selectedLines: new Set<string>(),
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

export function getFilteredVehicles(state: AppState): readonly Vehicle[] {
  if (state.selectedLines.size === 0) {
    return state.vehicles
  }
  return state.vehicles.filter((v) => state.selectedLines.has(v.line.id))
}

export function getFilteredRoutePaths(state: AppState): readonly RoutePath[] {
  if (state.selectedLines.size === 0) {
    return state.routePaths
  }
  return state.routePaths.filter((rp) => state.selectedLines.has(rp.routeId))
}
