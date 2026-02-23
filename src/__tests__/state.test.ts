import {
  createStore,
  setVehicles,
  setLines,
  setStops,
  setLoading,
  setRoutePaths,
  setTripShapesData,
  toggleLineFilter,
  clearLineFilter,
  toggleFavorite,
  setFavoriteLines,
  clearFavorites,
  addFavoriteStop,
  removeFavoriteStop,
  setFavoriteStops,
  getFilteredVehicles,
  getFilteredRoutePaths,
} from '../state'
import type { Vehicle, LineInfo, Stop, RoutePath, TripShapesData, FavoriteStop } from '../types'

function createMockLine(overrides: Partial<LineInfo> = {}): LineInfo {
  return {
    id: 'T1',
    name: 'Ligne 1',
    type: 'tram',
    color: '#005CA9',
    ...overrides,
  }
}

function createMockVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    vehicleId: 'v-001',
    tripId: 'trip-001',
    position: { lat: 43.61, lng: 3.87 },
    bearing: 90,
    line: createMockLine(),
    headsign: 'Mosson',
    directionId: '0',
    timestamp: 1700000000,
    ...overrides,
  }
}

function createMockRoutePath(overrides: Partial<RoutePath> = {}): RoutePath {
  return {
    routeId: 'T1',
    shapeId: 'shape-A',
    shortName: 'T1',
    color: '#005CA9',
    type: 'tram',
    coordinates: [[3.87, 43.60], [3.88, 43.61]],
    ...overrides,
  }
}

function createMockStop(overrides: Partial<Stop> = {}): Stop {
  return {
    stopId: 's-001',
    stopIds: ['s-001'],
    name: 'Comedie',
    position: { lat: 43.6085, lng: 3.8795 },
    routeIds: ['T1'],
    ...overrides,
  }
}

describe('createStore', () => {
  it('should return initial state', () => {
    const store = createStore()
    const state = store.getState()

    expect(state.vehicles).toEqual([])
    expect(state.lines).toEqual([])
    expect(state.stops).toEqual([])
    expect(state.selectedLines.size).toBe(0)
    expect(state.favoriteLines.size).toBe(0)
    expect(state.isLoading).toBe(false)
    expect(state.lastUpdated).toBeNull()
  })

  it('should update state immutably via setState', () => {
    const store = createStore()
    const prevState = store.getState()

    store.setState((state) => ({ ...state, isLoading: true }))

    const nextState = store.getState()

    expect(nextState).not.toBe(prevState)
    expect(nextState.isLoading).toBe(true)
    expect(prevState.isLoading).toBe(false)
  })

  it('should notify listeners on state change', () => {
    const store = createStore()
    const listener = vi.fn()

    store.subscribe(listener)
    store.setState(setLoading(true))

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ isLoading: true })
    )
  })

  it('should support unsubscribe', () => {
    const store = createStore()
    const listener = vi.fn()

    const unsubscribe = store.subscribe(listener)
    store.setState(setLoading(true))
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.setState(setLoading(false))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('should support multiple listeners', () => {
    const store = createStore()
    const listenerA = vi.fn()
    const listenerB = vi.fn()

    store.subscribe(listenerA)
    store.subscribe(listenerB)
    store.setState(setLoading(true))

    expect(listenerA).toHaveBeenCalledTimes(1)
    expect(listenerB).toHaveBeenCalledTimes(1)
  })
})

describe('setVehicles', () => {
  it('should replace vehicles and update lastUpdated', () => {
    const store = createStore()
    const vehicles = [createMockVehicle()]

    vi.spyOn(Date, 'now').mockReturnValue(1700000500)

    store.setState(setVehicles(vehicles))

    const state = store.getState()
    expect(state.vehicles).toEqual(vehicles)
    expect(state.lastUpdated).toBe(1700000500)

    vi.restoreAllMocks()
  })

  it('should not mutate original state', () => {
    const store = createStore()
    const prevState = store.getState()

    store.setState(setVehicles([createMockVehicle()]))

    expect(prevState.vehicles).toEqual([])
  })
})

describe('setLines', () => {
  it('should replace lines', () => {
    const store = createStore()
    const lines = [createMockLine(), createMockLine({ id: 'T2', name: 'Ligne 2' })]

    store.setState(setLines(lines))

    expect(store.getState().lines).toEqual(lines)
  })
})

describe('setStops', () => {
  it('should replace stops', () => {
    const store = createStore()
    const stops = [createMockStop()]

    store.setState(setStops(stops))

    expect(store.getState().stops).toEqual(stops)
  })
})

describe('setLoading', () => {
  it('should set isLoading to true', () => {
    const store = createStore()

    store.setState(setLoading(true))

    expect(store.getState().isLoading).toBe(true)
  })

  it('should set isLoading to false', () => {
    const store = createStore()
    store.setState(setLoading(true))

    store.setState(setLoading(false))

    expect(store.getState().isLoading).toBe(false)
  })
})

describe('toggleLineFilter', () => {
  it('should add a line to selectedLines when not present', () => {
    const store = createStore()

    store.setState(toggleLineFilter('T1'))

    expect(store.getState().selectedLines.has('T1')).toBe(true)
  })

  it('should remove a line from selectedLines when already present', () => {
    const store = createStore()

    store.setState(toggleLineFilter('T1'))
    store.setState(toggleLineFilter('T1'))

    expect(store.getState().selectedLines.has('T1')).toBe(false)
    expect(store.getState().selectedLines.size).toBe(0)
  })

  it('should support multiple selected lines', () => {
    const store = createStore()

    store.setState(toggleLineFilter('T1'))
    store.setState(toggleLineFilter('T2'))

    const selected = store.getState().selectedLines
    expect(selected.has('T1')).toBe(true)
    expect(selected.has('T2')).toBe(true)
    expect(selected.size).toBe(2)
  })

  it('should not mutate the previous Set', () => {
    const store = createStore()
    store.setState(toggleLineFilter('T1'))
    const prevSelected = store.getState().selectedLines

    store.setState(toggleLineFilter('T2'))

    expect(prevSelected.size).toBe(1)
    expect(prevSelected.has('T1')).toBe(true)
    expect(prevSelected.has('T2')).toBe(false)
  })
})

describe('clearLineFilter', () => {
  it('should clear all selected lines', () => {
    const store = createStore()
    store.setState(toggleLineFilter('T1'))
    store.setState(toggleLineFilter('T2'))

    store.setState(clearLineFilter())

    expect(store.getState().selectedLines.size).toBe(0)
  })

  it('should produce a new Set instance', () => {
    const store = createStore()
    store.setState(toggleLineFilter('T1'))
    const prevSelected = store.getState().selectedLines

    store.setState(clearLineFilter())

    expect(store.getState().selectedLines).not.toBe(prevSelected)
  })
})

describe('getFilteredVehicles', () => {
  it('should return all vehicles when no filter is active', () => {
    const vehicles = [
      createMockVehicle({ vehicleId: 'v-001' }),
      createMockVehicle({ vehicleId: 'v-002', line: createMockLine({ id: 'T2' }) }),
    ]
    const store = createStore()
    store.setState(setVehicles(vehicles))

    const result = getFilteredVehicles(store.getState())

    expect(result).toEqual(vehicles)
  })

  it('should filter vehicles by selected line', () => {
    const lineT1 = createMockLine({ id: 'T1' })
    const lineT2 = createMockLine({ id: 'T2', name: 'Ligne 2' })
    const vehicles = [
      createMockVehicle({ vehicleId: 'v-001', line: lineT1 }),
      createMockVehicle({ vehicleId: 'v-002', line: lineT2 }),
      createMockVehicle({ vehicleId: 'v-003', line: lineT1 }),
    ]
    const store = createStore()
    store.setState(setVehicles(vehicles))
    store.setState(toggleLineFilter('T1'))

    const result = getFilteredVehicles(store.getState())

    expect(result).toHaveLength(2)
    expect(result.every((v) => v.line.id === 'T1')).toBe(true)
  })

  it('should filter by multiple selected lines', () => {
    const lineT1 = createMockLine({ id: 'T1' })
    const lineT2 = createMockLine({ id: 'T2' })
    const lineT3 = createMockLine({ id: 'T3' })
    const vehicles = [
      createMockVehicle({ vehicleId: 'v-001', line: lineT1 }),
      createMockVehicle({ vehicleId: 'v-002', line: lineT2 }),
      createMockVehicle({ vehicleId: 'v-003', line: lineT3 }),
    ]
    const store = createStore()
    store.setState(setVehicles(vehicles))
    store.setState(toggleLineFilter('T1'))
    store.setState(toggleLineFilter('T3'))

    const result = getFilteredVehicles(store.getState())

    expect(result).toHaveLength(2)
    expect(result.map((v) => v.line.id)).toEqual(['T1', 'T3'])
  })

  it('should return empty array when filter matches no vehicles', () => {
    const vehicles = [
      createMockVehicle({ vehicleId: 'v-001', line: createMockLine({ id: 'T1' }) }),
    ]
    const store = createStore()
    store.setState(setVehicles(vehicles))
    store.setState(toggleLineFilter('T5'))

    const result = getFilteredVehicles(store.getState())

    expect(result).toHaveLength(0)
  })
})

describe('toggleFavorite', () => {
  it('should add a line to favoriteLines when not present', () => {
    const store = createStore()

    store.setState(toggleFavorite('T1'))

    expect(store.getState().favoriteLines.has('T1')).toBe(true)
  })

  it('should remove a line from favoriteLines when already present', () => {
    const store = createStore()

    store.setState(toggleFavorite('T1'))
    store.setState(toggleFavorite('T1'))

    expect(store.getState().favoriteLines.has('T1')).toBe(false)
    expect(store.getState().favoriteLines.size).toBe(0)
  })

  it('should not mutate the previous Set', () => {
    const store = createStore()
    store.setState(toggleFavorite('T1'))
    const prevFavorites = store.getState().favoriteLines

    store.setState(toggleFavorite('T2'))

    expect(prevFavorites.size).toBe(1)
    expect(prevFavorites.has('T2')).toBe(false)
  })

  it('should not affect selectedLines', () => {
    const store = createStore()
    store.setState(toggleLineFilter('T1'))

    store.setState(toggleFavorite('T2'))

    const state = store.getState()
    expect(state.selectedLines.has('T1')).toBe(true)
    expect(state.selectedLines.has('T2')).toBe(false)
    expect(state.favoriteLines.has('T2')).toBe(true)
  })
})

describe('setFavoriteLines', () => {
  it('should replace favoriteLines with provided set', () => {
    const store = createStore()
    store.setState(toggleFavorite('T1'))

    store.setState(setFavoriteLines(new Set(['T3', 'T4'])))

    const favorites = store.getState().favoriteLines
    expect(favorites.has('T1')).toBe(false)
    expect(favorites.has('T3')).toBe(true)
    expect(favorites.has('T4')).toBe(true)
    expect(favorites.size).toBe(2)
  })
})

describe('clearFavorites', () => {
  it('should clear all favorite lines', () => {
    const store = createStore()
    store.setState(toggleFavorite('T1'))
    store.setState(toggleFavorite('T2'))

    store.setState(clearFavorites())

    expect(store.getState().favoriteLines.size).toBe(0)
  })

  it('should produce a new Set instance', () => {
    const store = createStore()
    store.setState(toggleFavorite('T1'))
    const prevFavorites = store.getState().favoriteLines

    store.setState(clearFavorites())

    expect(store.getState().favoriteLines).not.toBe(prevFavorites)
  })
})

describe('getFilteredRoutePaths', () => {
  it('should return all paths when tripShapesData is null', () => {
    const store = createStore()
    const paths = [
      createMockRoutePath({ routeId: 'T1', shapeId: 'shape-A' }),
      createMockRoutePath({ routeId: 'T1', shapeId: 'shape-B' }),
    ]
    store.setState(setRoutePaths(paths))

    const result = getFilteredRoutePaths(store.getState())

    expect(result).toEqual(paths)
  })

  it('should show only active shapes when vehicles are running', () => {
    const store = createStore()
    const paths = [
      createMockRoutePath({ routeId: 'T1', shapeId: 'shape-A' }),
      createMockRoutePath({ routeId: 'T1', shapeId: 'shape-B' }),
    ]
    const tripShapes: TripShapesData = {
      tripShapes: { 'trip-001': 'shape-A' },
      defaultShapes: { 'T1': 'shape-B' },
    }
    store.setState(setRoutePaths(paths))
    store.setState(setTripShapesData(tripShapes))
    store.setState(setVehicles([
      createMockVehicle({ tripId: 'trip-001', line: createMockLine({ id: 'T1' }) }),
    ]))

    const result = getFilteredRoutePaths(store.getState())

    expect(result).toHaveLength(1)
    expect(result[0].shapeId).toBe('shape-A')
  })

  it('should fall back to default shape when no vehicles on route', () => {
    const store = createStore()
    const paths = [
      createMockRoutePath({ routeId: 'T1', shapeId: 'shape-A' }),
      createMockRoutePath({ routeId: 'T1', shapeId: 'shape-B' }),
    ]
    const tripShapes: TripShapesData = {
      tripShapes: {},
      defaultShapes: { 'T1': 'shape-B' },
    }
    store.setState(setRoutePaths(paths))
    store.setState(setTripShapesData(tripShapes))

    const result = getFilteredRoutePaths(store.getState())

    expect(result).toHaveLength(1)
    expect(result[0].shapeId).toBe('shape-B')
  })

  it('should combine line filter and shape filter', () => {
    const store = createStore()
    const paths = [
      createMockRoutePath({ routeId: 'T1', shapeId: 'shape-A' }),
      createMockRoutePath({ routeId: 'T1', shapeId: 'shape-B' }),
      createMockRoutePath({ routeId: 'T2', shapeId: 'shape-C' }),
    ]
    const tripShapes: TripShapesData = {
      tripShapes: { 'trip-001': 'shape-A' },
      defaultShapes: { 'T1': 'shape-B', 'T2': 'shape-C' },
    }
    store.setState(setRoutePaths(paths))
    store.setState(setTripShapesData(tripShapes))
    store.setState(setVehicles([
      createMockVehicle({ tripId: 'trip-001', line: createMockLine({ id: 'T1' }) }),
    ]))
    store.setState(toggleLineFilter('T1'))

    const result = getFilteredRoutePaths(store.getState())

    expect(result).toHaveLength(1)
    expect(result[0].routeId).toBe('T1')
    expect(result[0].shapeId).toBe('shape-A')
  })

  it('should show multiple active shapes for same route', () => {
    const store = createStore()
    const paths = [
      createMockRoutePath({ routeId: 'T1', shapeId: 'shape-A' }),
      createMockRoutePath({ routeId: 'T1', shapeId: 'shape-B' }),
      createMockRoutePath({ routeId: 'T1', shapeId: 'shape-C' }),
    ]
    const tripShapes: TripShapesData = {
      tripShapes: { 'trip-001': 'shape-A', 'trip-002': 'shape-B' },
      defaultShapes: { 'T1': 'shape-C' },
    }
    store.setState(setRoutePaths(paths))
    store.setState(setTripShapesData(tripShapes))
    store.setState(setVehicles([
      createMockVehicle({ vehicleId: 'v-001', tripId: 'trip-001', line: createMockLine({ id: 'T1' }) }),
      createMockVehicle({ vehicleId: 'v-002', tripId: 'trip-002', line: createMockLine({ id: 'T1' }) }),
    ]))

    const result = getFilteredRoutePaths(store.getState())

    expect(result).toHaveLength(2)
    const shapeIds = result.map((rp) => rp.shapeId)
    expect(shapeIds).toContain('shape-A')
    expect(shapeIds).toContain('shape-B')
  })
})

function createMockFavoriteStop(overrides: Partial<FavoriteStop> = {}): FavoriteStop {
  return {
    stopId: 's-001',
    stopIds: ['s-001', 's-002'],
    name: 'Comédie',
    position: { lat: 43.6085, lng: 3.8795 },
    ...overrides,
  }
}

describe('addFavoriteStop', () => {
  it('should add a stop to favoriteStops', () => {
    const store = createStore()
    const fav = createMockFavoriteStop()

    store.setState(addFavoriteStop(fav))

    expect(store.getState().favoriteStops).toHaveLength(1)
    expect(store.getState().favoriteStops[0].stopId).toBe('s-001')
  })

  it('should not add duplicate stop (same stopId)', () => {
    const store = createStore()
    const fav = createMockFavoriteStop()

    store.setState(addFavoriteStop(fav))
    store.setState(addFavoriteStop(fav))

    expect(store.getState().favoriteStops).toHaveLength(1)
  })

  it('should return same state reference on duplicate', () => {
    const store = createStore()
    const fav = createMockFavoriteStop()
    store.setState(addFavoriteStop(fav))
    const prevState = store.getState()

    store.setState(addFavoriteStop(fav))

    expect(store.getState()).toBe(prevState)
  })

  it('should allow multiple different stops', () => {
    const store = createStore()

    store.setState(addFavoriteStop(createMockFavoriteStop({ stopId: 's-001', name: 'A' })))
    store.setState(addFavoriteStop(createMockFavoriteStop({ stopId: 's-002', name: 'B' })))

    expect(store.getState().favoriteStops).toHaveLength(2)
  })

  it('should not mutate previous array', () => {
    const store = createStore()
    store.setState(addFavoriteStop(createMockFavoriteStop({ stopId: 's-001' })))
    const prevFavs = store.getState().favoriteStops

    store.setState(addFavoriteStop(createMockFavoriteStop({ stopId: 's-002' })))

    expect(prevFavs).toHaveLength(1)
  })
})

describe('removeFavoriteStop', () => {
  it('should remove a stop by stopId', () => {
    const store = createStore()
    store.setState(addFavoriteStop(createMockFavoriteStop({ stopId: 's-001' })))
    store.setState(addFavoriteStop(createMockFavoriteStop({ stopId: 's-002', name: 'Other' })))

    store.setState(removeFavoriteStop('s-001'))

    expect(store.getState().favoriteStops).toHaveLength(1)
    expect(store.getState().favoriteStops[0].stopId).toBe('s-002')
  })

  it('should return empty array when removing last stop', () => {
    const store = createStore()
    store.setState(addFavoriteStop(createMockFavoriteStop()))

    store.setState(removeFavoriteStop('s-001'))

    expect(store.getState().favoriteStops).toEqual([])
  })

  it('should not mutate previous array', () => {
    const store = createStore()
    store.setState(addFavoriteStop(createMockFavoriteStop()))
    const prevFavs = store.getState().favoriteStops

    store.setState(removeFavoriteStop('s-001'))

    expect(prevFavs).toHaveLength(1)
  })
})

describe('setFavoriteStops', () => {
  it('should replace entire favoriteStops array', () => {
    const store = createStore()
    store.setState(addFavoriteStop(createMockFavoriteStop({ stopId: 's-001' })))

    const newFavs = [
      createMockFavoriteStop({ stopId: 's-010', name: 'X' }),
      createMockFavoriteStop({ stopId: 's-020', name: 'Y' }),
    ]
    store.setState(setFavoriteStops(newFavs))

    const result = store.getState().favoriteStops
    expect(result).toHaveLength(2)
    expect(result[0].stopId).toBe('s-010')
    expect(result[1].stopId).toBe('s-020')
  })

  it('should allow setting empty array', () => {
    const store = createStore()
    store.setState(addFavoriteStop(createMockFavoriteStop()))

    store.setState(setFavoriteStops([]))

    expect(store.getState().favoriteStops).toEqual([])
  })
})
