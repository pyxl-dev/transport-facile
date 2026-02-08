import {
  createStore,
  setVehicles,
  setLines,
  setStops,
  setLoading,
  toggleLineFilter,
  clearLineFilter,
  getFilteredVehicles,
} from '../state'
import type { Vehicle, LineInfo, Stop } from '../types'

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
    position: { lat: 43.61, lng: 3.87 },
    bearing: 90,
    line: createMockLine(),
    headsign: 'Mosson',
    timestamp: 1700000000,
    ...overrides,
  }
}

function createMockStop(overrides: Partial<Stop> = {}): Stop {
  return {
    stopId: 's-001',
    name: 'Comedie',
    position: { lat: 43.6085, lng: 3.8795 },
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
