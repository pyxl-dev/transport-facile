import { enrichVehicles } from '../services/vehicle-enricher.js'
import type {
  RawVehiclePosition,
  GtfsStaticData,
  GtfsRoute,
  GtfsTrip,
} from '../../src/types.js'

function createStaticData(overrides?: {
  readonly routes?: ReadonlyMap<string, GtfsRoute>
  readonly trips?: ReadonlyMap<string, GtfsTrip>
}): GtfsStaticData {
  const defaultRoutes = new Map<string, GtfsRoute>([
    [
      'R1',
      {
        routeId: 'R1',
        shortName: '1',
        longName: 'Mosson - Odysseum',
        type: 0,
        color: '#0074CE',
        textColor: '#FFFFFF',
      },
    ],
    [
      'R2',
      {
        routeId: 'R2',
        shortName: '10',
        longName: 'Bus Line 10',
        type: 3,
        color: '#FF0000',
        textColor: '#000000',
      },
    ],
  ])

  const defaultTrips = new Map<string, GtfsTrip>([
    [
      'T100',
      {
        tripId: 'T100',
        routeId: 'R1',
        headsign: 'Odysseum',
        directionId: '0',
      },
    ],
    [
      'T200',
      {
        tripId: 'T200',
        routeId: 'R2',
        headsign: 'Grammont',
        directionId: '1',
      },
    ],
  ])

  return {
    routes: overrides?.routes ?? defaultRoutes,
    trips: overrides?.trips ?? defaultTrips,
    stops: new Map(),
  }
}

describe('vehicle-enricher', () => {
  describe('enrichVehicles', () => {
    it('should enrich raw positions with route info', () => {
      const rawPositions: readonly RawVehiclePosition[] = [
        {
          vehicleId: 'V1',
          tripId: 'T100',
          lat: 43.6085,
          lng: 3.8805,
          bearing: 90,
          timestamp: 1700000000,
        },
      ]

      const staticData = createStaticData()
      const vehicles = enrichVehicles(rawPositions, staticData)

      expect(vehicles).toHaveLength(1)
      expect(vehicles[0]).toEqual({
        vehicleId: 'V1',
        position: {
          lat: 43.6085,
          lng: 3.8805,
        },
        bearing: 90,
        line: {
          id: 'R1',
          name: '1',
          type: 'tram',
          color: '#0074CE',
        },
        headsign: 'Odysseum',
        timestamp: 1700000000,
      })
    })

    it('should map route_type 0 to tram', () => {
      const rawPositions: readonly RawVehiclePosition[] = [
        {
          vehicleId: 'V1',
          tripId: 'T100',
          lat: 43.6,
          lng: 3.88,
          bearing: 0,
          timestamp: 1700000000,
        },
      ]

      const staticData = createStaticData()
      const vehicles = enrichVehicles(rawPositions, staticData)

      expect(vehicles[0]?.line.type).toBe('tram')
    })

    it('should map route_type 3 to bus', () => {
      const rawPositions: readonly RawVehiclePosition[] = [
        {
          vehicleId: 'V2',
          tripId: 'T200',
          lat: 43.6,
          lng: 3.88,
          bearing: 0,
          timestamp: 1700000000,
        },
      ]

      const staticData = createStaticData()
      const vehicles = enrichVehicles(rawPositions, staticData)

      expect(vehicles[0]?.line.type).toBe('bus')
    })

    it('should map unknown route_type to bus', () => {
      const routes = new Map<string, GtfsRoute>([
        [
          'R99',
          {
            routeId: 'R99',
            shortName: '99',
            longName: 'Unknown Type',
            type: 7,
            color: '#333333',
            textColor: '#FFFFFF',
          },
        ],
      ])

      const trips = new Map<string, GtfsTrip>([
        [
          'T99',
          {
            tripId: 'T99',
            routeId: 'R99',
            headsign: 'Somewhere',
            directionId: '0',
          },
        ],
      ])

      const rawPositions: readonly RawVehiclePosition[] = [
        {
          vehicleId: 'V99',
          tripId: 'T99',
          lat: 43.6,
          lng: 3.88,
          bearing: 0,
          timestamp: 1700000000,
        },
      ]

      const staticData = createStaticData({ routes, trips })
      const vehicles = enrichVehicles(rawPositions, staticData)

      expect(vehicles[0]?.line.type).toBe('bus')
    })

    it('should skip vehicles with unknown tripId', () => {
      const rawPositions: readonly RawVehiclePosition[] = [
        {
          vehicleId: 'V1',
          tripId: 'UNKNOWN_TRIP',
          lat: 43.6,
          lng: 3.88,
          bearing: 0,
          timestamp: 1700000000,
        },
      ]

      const staticData = createStaticData()
      const vehicles = enrichVehicles(rawPositions, staticData)

      expect(vehicles).toHaveLength(0)
    })

    it('should skip vehicles with unknown routeId', () => {
      const trips = new Map<string, GtfsTrip>([
        [
          'T999',
          {
            tripId: 'T999',
            routeId: 'UNKNOWN_ROUTE',
            headsign: 'Nowhere',
            directionId: '0',
          },
        ],
      ])

      const rawPositions: readonly RawVehiclePosition[] = [
        {
          vehicleId: 'V1',
          tripId: 'T999',
          lat: 43.6,
          lng: 3.88,
          bearing: 0,
          timestamp: 1700000000,
        },
      ]

      const staticData = createStaticData({ trips })
      const vehicles = enrichVehicles(rawPositions, staticData)

      expect(vehicles).toHaveLength(0)
    })

    it('should enrich multiple vehicles', () => {
      const rawPositions: readonly RawVehiclePosition[] = [
        {
          vehicleId: 'V1',
          tripId: 'T100',
          lat: 43.6085,
          lng: 3.8805,
          bearing: 90,
          timestamp: 1700000000,
        },
        {
          vehicleId: 'V2',
          tripId: 'T200',
          lat: 43.6100,
          lng: 3.8900,
          bearing: 180,
          timestamp: 1700000010,
        },
      ]

      const staticData = createStaticData()
      const vehicles = enrichVehicles(rawPositions, staticData)

      expect(vehicles).toHaveLength(2)
      expect(vehicles[0]?.line.name).toBe('1')
      expect(vehicles[0]?.line.type).toBe('tram')
      expect(vehicles[1]?.line.name).toBe('10')
      expect(vehicles[1]?.line.type).toBe('bus')
    })

    it('should return empty array for empty input', () => {
      const staticData = createStaticData()
      const vehicles = enrichVehicles([], staticData)

      expect(vehicles).toEqual([])
    })

    it('should not mutate input data', () => {
      const rawPositions: readonly RawVehiclePosition[] = [
        {
          vehicleId: 'V1',
          tripId: 'T100',
          lat: 43.6,
          lng: 3.88,
          bearing: 0,
          timestamp: 1700000000,
        },
      ]

      const staticData = createStaticData()
      const originalTripsSize = staticData.trips.size
      const originalRoutesSize = staticData.routes.size

      enrichVehicles(rawPositions, staticData)

      expect(staticData.trips.size).toBe(originalTripsSize)
      expect(staticData.routes.size).toBe(originalRoutesSize)
    })
  })
})
