// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Vehicle } from '../types'

const addedMarkers: any[] = []
const removedMarkers: any[] = []

vi.mock('maplibre-gl', () => {
  class MockMarker {
    _lngLat: [number, number] = [0, 0]
    _element: HTMLElement | null = null
    _removed = false

    constructor(opts?: { element?: HTMLElement; anchor?: string }) {
      this._element = opts?.element ?? null
    }

    setLngLat(lngLat: [number, number]) {
      this._lngLat = lngLat
      return this
    }

    addTo() {
      addedMarkers.push(this)
      return this
    }

    remove() {
      this._removed = true
      removedMarkers.push(this)
      return this
    }

    getLngLat() {
      return { lng: this._lngLat[0], lat: this._lngLat[1] }
    }

    getElement() {
      return this._element
    }
  }

  class MockPopup {
    _offset: number | undefined
    constructor(opts?: { offset?: number }) {
      this._offset = opts?.offset
    }
    setLngLat() { return this }
    setHTML() { return this }
    addTo() { return this }
  }

  return {
    default: {
      Marker: MockMarker,
      Popup: MockPopup,
    },
  }
})

function createVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    vehicleId: 'v-001',
    position: { lat: 43.6108, lng: 3.8767 },
    bearing: 90,
    line: {
      id: 'T1',
      name: 'T1',
      type: 'tram',
      color: '#005CA9',
    },
    headsign: 'Mosson',
    timestamp: Date.now(),
    ...overrides,
  }
}

function createMockMap() {
  const canvas = document.createElement('canvas')
  return {
    getCanvas: () => canvas,
    on: vi.fn(),
  } as any
}

describe('vehicle-marker-manager', () => {
  let initVehicleMarkers: typeof import('../map/vehicle-marker-manager').initVehicleMarkers
  let updateVehicleMarkers: typeof import('../map/vehicle-marker-manager').updateVehicleMarkers

  beforeEach(async () => {
    addedMarkers.length = 0
    removedMarkers.length = 0
    vi.resetModules()
    const mod = await import('../map/vehicle-marker-manager')
    initVehicleMarkers = mod.initVehicleMarkers
    updateVehicleMarkers = mod.updateVehicleMarkers
  })

  it('should create markers for new vehicles', () => {
    const map = createMockMap()
    initVehicleMarkers(map)

    const vehicles = [
      createVehicle({ vehicleId: 'v-001' }),
      createVehicle({ vehicleId: 'v-002' }),
    ]
    updateVehicleMarkers(map, vehicles)

    expect(addedMarkers).toHaveLength(2)
  })

  it('should not create duplicate markers when updating existing vehicles', () => {
    const map = createMockMap()
    initVehicleMarkers(map)

    const vehicles1 = [createVehicle({ vehicleId: 'v-001' })]
    updateVehicleMarkers(map, vehicles1)
    expect(addedMarkers).toHaveLength(1)

    const vehicles2 = [createVehicle({
      vehicleId: 'v-001',
      position: { lat: 43.62, lng: 3.89 },
      bearing: 180,
    })]
    updateVehicleMarkers(map, vehicles2)

    expect(addedMarkers).toHaveLength(1)
  })

  it('should remove markers for disappeared vehicles', () => {
    const map = createMockMap()
    initVehicleMarkers(map)

    const vehicles = [
      createVehicle({ vehicleId: 'v-001' }),
      createVehicle({ vehicleId: 'v-002' }),
    ]
    updateVehicleMarkers(map, vehicles)
    expect(addedMarkers).toHaveLength(2)

    updateVehicleMarkers(map, [createVehicle({ vehicleId: 'v-001' })])
    expect(removedMarkers).toHaveLength(1)
  })

  it('should handle empty vehicle list', () => {
    const map = createMockMap()
    initVehicleMarkers(map)

    updateVehicleMarkers(map, [])
    expect(addedMarkers).toHaveLength(0)
    expect(removedMarkers).toHaveLength(0)
  })

  it('should remove all markers when going from some vehicles to empty', () => {
    const map = createMockMap()
    initVehicleMarkers(map)

    updateVehicleMarkers(map, [
      createVehicle({ vehicleId: 'v-001' }),
      createVehicle({ vehicleId: 'v-002' }),
    ])
    expect(addedMarkers).toHaveLength(2)

    updateVehicleMarkers(map, [])
    expect(removedMarkers).toHaveLength(2)
  })

  it('should update marker element bearing on update', () => {
    const map = createMockMap()
    initVehicleMarkers(map)

    updateVehicleMarkers(map, [createVehicle({ vehicleId: 'v-001', bearing: 0 })])

    const marker = addedMarkers[0]
    const rotator = marker._element.querySelector('.vehicle-marker__rotator') as HTMLElement

    expect(rotator.style.transform).toBe('rotate(0deg)')

    updateVehicleMarkers(map, [createVehicle({ vehicleId: 'v-001', bearing: 270 })])

    expect(rotator.style.transform).toBe('rotate(270deg)')
  })
})
