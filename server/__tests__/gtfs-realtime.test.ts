import GtfsRealtimeBindings from 'gtfs-realtime-bindings'

const { transit_realtime } = GtfsRealtimeBindings
import { fetchVehiclePositions } from '../services/gtfs-realtime.js'

function createMockFeedBuffer(
  entities: Array<{
    readonly id: string
    readonly tripId: string
    readonly vehicleId: string
    readonly lat: number
    readonly lng: number
    readonly bearing: number
    readonly timestamp: number
  }>,
): Uint8Array {
  const feedMessage = transit_realtime.FeedMessage.create({
    header: {
      gtfsRealtimeVersion: '2.0',
      timestamp: Math.floor(Date.now() / 1000),
    },
    entity: entities.map((e) => ({
      id: e.id,
      vehicle: {
        trip: { tripId: e.tripId },
        position: {
          latitude: e.lat,
          longitude: e.lng,
          bearing: e.bearing,
        },
        vehicle: { id: e.vehicleId },
        timestamp: e.timestamp,
      },
    })),
  })

  return transit_realtime.FeedMessage.encode(feedMessage).finish()
}

describe('gtfs-realtime', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('fetchVehiclePositions', () => {
    it('should decode vehicle positions from protobuf', async () => {
      const buffer = createMockFeedBuffer([
        {
          id: 'entity1',
          tripId: 'T100',
          vehicleId: 'V1',
          lat: 43.6085,
          lng: 3.8805,
          bearing: 90,
          timestamp: 1700000000,
        },
        {
          id: 'entity2',
          tripId: 'T200',
          vehicleId: 'V2',
          lat: 43.6100,
          lng: 3.8900,
          bearing: 180,
          timestamp: 1700000010,
        },
      ])

      globalThis.fetch = vi.fn(() =>
        Promise.resolve(new Response(new Uint8Array(buffer), { status: 200 })),
      ) as typeof globalThis.fetch

      const positions = await fetchVehiclePositions(['https://example.com/feed.pb'])

      expect(positions).toHaveLength(2)
      expect(positions[0]).toEqual({
        vehicleId: 'V1',
        tripId: 'T100',
        lat: expect.closeTo(43.6085, 3),
        lng: expect.closeTo(3.8805, 3),
        bearing: 90,
        timestamp: 1700000000,
      })
      expect(positions[1]).toEqual({
        vehicleId: 'V2',
        tripId: 'T200',
        lat: expect.closeTo(43.61, 3),
        lng: expect.closeTo(3.89, 3),
        bearing: 180,
        timestamp: 1700000010,
      })
    })

    it('should merge results from multiple URLs', async () => {
      const buffer1 = createMockFeedBuffer([
        {
          id: 'e1',
          tripId: 'T1',
          vehicleId: 'V1',
          lat: 43.6,
          lng: 3.88,
          bearing: 0,
          timestamp: 1700000000,
        },
      ])
      const buffer2 = createMockFeedBuffer([
        {
          id: 'e2',
          tripId: 'T2',
          vehicleId: 'V2',
          lat: 43.7,
          lng: 3.89,
          bearing: 45,
          timestamp: 1700000001,
        },
      ])

      globalThis.fetch = vi.fn((url: string | URL | Request) => {
        const urlStr = String(url)
        const buffer = urlStr.includes('/urban/') ? buffer1 : buffer2
        return Promise.resolve(new Response(new Uint8Array(buffer), { status: 200 }))
      }) as typeof globalThis.fetch

      const positions = await fetchVehiclePositions([
        'https://example.com/urban/feed.pb',
        'https://example.com/suburban/feed.pb',
      ])

      expect(positions).toHaveLength(2)
      expect(positions[0]?.vehicleId).toBe('V1')
      expect(positions[1]?.vehicleId).toBe('V2')
    })

    it('should return empty array when no URLs provided', async () => {
      const positions = await fetchVehiclePositions([])
      expect(positions).toEqual([])
    })

    it('should handle fetch errors gracefully', async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.reject(new Error('Network error')),
      ) as typeof globalThis.fetch

      const positions = await fetchVehiclePositions(['https://example.com/fail.pb'])

      expect(positions).toEqual([])
    })

    it('should continue when one URL fails', async () => {
      const buffer = createMockFeedBuffer([
        {
          id: 'e1',
          tripId: 'T1',
          vehicleId: 'V1',
          lat: 43.6,
          lng: 3.88,
          bearing: 0,
          timestamp: 1700000000,
        },
      ])

      let callCount = 0
      globalThis.fetch = vi.fn(() => {
        callCount += 1
        if (callCount === 1) {
          return Promise.reject(new Error('First URL fails'))
        }
        return Promise.resolve(new Response(new Uint8Array(buffer), { status: 200 }))
      }) as typeof globalThis.fetch

      const positions = await fetchVehiclePositions([
        'https://example.com/fail.pb',
        'https://example.com/success.pb',
      ])

      expect(positions).toHaveLength(1)
      expect(positions[0]?.vehicleId).toBe('V1')
    })

    it('should skip entities without tripId or vehicleId', async () => {
      const feedMessage = transit_realtime.FeedMessage.create({
        header: {
          gtfsRealtimeVersion: '2.0',
          timestamp: Math.floor(Date.now() / 1000),
        },
        entity: [
          {
            id: 'valid',
            vehicle: {
              trip: { tripId: 'T1' },
              position: { latitude: 43.6, longitude: 3.88, bearing: 0 },
              vehicle: { id: 'V1' },
              timestamp: 1700000000,
            },
          },
          {
            id: 'missing-trip',
            vehicle: {
              trip: {},
              position: { latitude: 43.6, longitude: 3.88, bearing: 0 },
              vehicle: { id: 'V2' },
              timestamp: 1700000001,
            },
          },
          {
            id: 'missing-vehicle-id',
            vehicle: {
              trip: { tripId: 'T3' },
              position: { latitude: 43.6, longitude: 3.88, bearing: 0 },
              vehicle: {},
              timestamp: 1700000002,
            },
          },
        ],
      })

      const buffer = transit_realtime.FeedMessage.encode(feedMessage).finish()

      globalThis.fetch = vi.fn(() =>
        Promise.resolve(new Response(new Uint8Array(buffer), { status: 200 })),
      ) as typeof globalThis.fetch

      const positions = await fetchVehiclePositions(['https://example.com/feed.pb'])

      expect(positions).toHaveLength(1)
      expect(positions[0]?.vehicleId).toBe('V1')
    })
  })
})
