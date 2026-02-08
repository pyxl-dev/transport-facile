import { describe, it, expect } from 'vitest'
import { vehiclesToGeoJSON } from '../map/vehicle-layer'
import type { Vehicle } from '../types'

function createVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    vehicleId: 'v-001',
    position: { lat: 43.6108, lng: 3.8767 },
    bearing: 90,
    line: {
      id: 'T1',
      name: 'Ligne 1',
      type: 'tram',
      color: '#005CA9',
    },
    headsign: 'Mosson',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('vehiclesToGeoJSON', () => {
  it('should return an empty FeatureCollection when given no vehicles', () => {
    const result = vehiclesToGeoJSON([])

    expect(result).toEqual({
      type: 'FeatureCollection',
      features: [],
    })
  })

  it('should convert a single vehicle to a GeoJSON Feature', () => {
    const vehicle = createVehicle()
    const result = vehiclesToGeoJSON([vehicle])

    expect(result.type).toBe('FeatureCollection')
    expect(result.features).toHaveLength(1)

    const feature = result.features[0]
    expect(feature.type).toBe('Feature')
    expect(feature.geometry).toEqual({
      type: 'Point',
      coordinates: [3.8767, 43.6108],
    })
    expect(feature.properties).toEqual({
      vehicleId: 'v-001',
      color: '#005CA9',
      bearing: 90,
      lineName: 'Ligne 1',
      lineType: 'tram',
      headsign: 'Mosson',
    })
  })

  it('should convert multiple vehicles to GeoJSON features', () => {
    const vehicles: readonly Vehicle[] = [
      createVehicle({ vehicleId: 'v-001' }),
      createVehicle({
        vehicleId: 'v-002',
        position: { lat: 43.62, lng: 3.89 },
        bearing: 180,
        line: {
          id: 'T2',
          name: 'Ligne 2',
          type: 'tram',
          color: '#EE7F00',
        },
        headsign: 'Saint-Jean-de-Vedas',
      }),
    ]

    const result = vehiclesToGeoJSON(vehicles)

    expect(result.features).toHaveLength(2)
    expect(result.features[0].properties?.vehicleId).toBe('v-001')
    expect(result.features[1].properties?.vehicleId).toBe('v-002')
  })

  it('should map coordinates as [lng, lat] (GeoJSON order)', () => {
    const vehicle = createVehicle({
      position: { lat: 43.5, lng: 3.9 },
    })

    const result = vehiclesToGeoJSON([vehicle])
    const coordinates = (result.features[0].geometry as GeoJSON.Point).coordinates

    expect(coordinates[0]).toBe(3.9)
    expect(coordinates[1]).toBe(43.5)
  })

  it('should preserve vehicle bearing in properties', () => {
    const vehicle = createVehicle({ bearing: 270 })
    const result = vehiclesToGeoJSON([vehicle])

    expect(result.features[0].properties?.bearing).toBe(270)
  })

  it('should handle bus type vehicles', () => {
    const vehicle = createVehicle({
      line: {
        id: 'B6',
        name: 'Ligne 6',
        type: 'bus',
        color: '#FF0000',
      },
    })

    const result = vehiclesToGeoJSON([vehicle])

    expect(result.features[0].properties?.lineType).toBe('bus')
    expect(result.features[0].properties?.color).toBe('#FF0000')
  })

  it('should not mutate the input array', () => {
    const vehicles: readonly Vehicle[] = [
      createVehicle({ vehicleId: 'v-001' }),
      createVehicle({ vehicleId: 'v-002' }),
    ]

    const originalLength = vehicles.length
    vehiclesToGeoJSON(vehicles)

    expect(vehicles).toHaveLength(originalLength)
    expect(vehicles[0].vehicleId).toBe('v-001')
    expect(vehicles[1].vehicleId).toBe('v-002')
  })

  it('should produce valid GeoJSON structure', () => {
    const vehicle = createVehicle()
    const result = vehiclesToGeoJSON([vehicle])

    expect(result).toHaveProperty('type', 'FeatureCollection')
    expect(result).toHaveProperty('features')
    expect(Array.isArray(result.features)).toBe(true)

    const feature = result.features[0]
    expect(feature).toHaveProperty('type', 'Feature')
    expect(feature).toHaveProperty('geometry')
    expect(feature).toHaveProperty('properties')
    expect(feature.geometry).toHaveProperty('type', 'Point')
    expect(feature.geometry).toHaveProperty('coordinates')
  })
})
