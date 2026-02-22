import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import { decodeTripUpdates, fetchTripUpdates } from '../services/gtfs-trip-update.js'

const { transit_realtime } = GtfsRealtimeBindings

function encodeFeed(
  entities: { tripId: string; routeId: string; stops: { stopId: string; arrival?: number; departure?: number }[] }[]
): Uint8Array {
  const feedMessage = transit_realtime.FeedMessage.create({
    header: {
      gtfsRealtimeVersion: '2.0',
      timestamp: Math.floor(Date.now() / 1000),
    },
    entity: entities.map((e, i) => ({
      id: String(i),
      tripUpdate: {
        trip: { tripId: e.tripId, routeId: e.routeId },
        stopTimeUpdate: e.stops.map((s) => ({
          stopId: s.stopId,
          arrival: s.arrival ? { time: s.arrival } : undefined,
          departure: s.departure ? { time: s.departure } : undefined,
        })),
      },
    })),
  })
  return transit_realtime.FeedMessage.encode(feedMessage).finish()
}

describe('decodeTripUpdates', () => {
  it('should decode trip updates with stop time updates', () => {
    const now = Math.floor(Date.now() / 1000)
    const buffer = encodeFeed([
      {
        tripId: 'trip-1',
        routeId: 'route-1',
        stops: [
          { stopId: 'stop-A', arrival: now + 300, departure: now + 330 },
          { stopId: 'stop-B', arrival: now + 600 },
        ],
      },
    ])

    const result = decodeTripUpdates(buffer)

    expect(result).toHaveLength(2)
    expect(result[0].tripId).toBe('trip-1')
    expect(result[0].routeId).toBe('route-1')
    expect(result[0].stopId).toBe('stop-A')
    expect(result[0].arrivalTime).toBe(now + 300)
    expect(result[0].departureTime).toBe(now + 330)
    expect(result[1].stopId).toBe('stop-B')
    expect(result[1].departureTime).toBeUndefined()
  })

  it('should skip entities without tripId', () => {
    const feedMessage = transit_realtime.FeedMessage.create({
      header: { gtfsRealtimeVersion: '2.0', timestamp: 0 },
      entity: [{ id: '0', tripUpdate: { trip: {} } }],
    })
    const buffer = transit_realtime.FeedMessage.encode(feedMessage).finish()

    const result = decodeTripUpdates(buffer)

    expect(result).toHaveLength(0)
  })

  it('should skip stop updates without stopId', () => {
    const feedMessage = transit_realtime.FeedMessage.create({
      header: { gtfsRealtimeVersion: '2.0', timestamp: 0 },
      entity: [{
        id: '0',
        tripUpdate: {
          trip: { tripId: 'trip-1' },
          stopTimeUpdate: [{ arrival: { time: 1000 } }],
        },
      }],
    })
    const buffer = transit_realtime.FeedMessage.encode(feedMessage).finish()

    const result = decodeTripUpdates(buffer)

    expect(result).toHaveLength(0)
  })

  it('should handle multiple trips', () => {
    const now = Math.floor(Date.now() / 1000)
    const buffer = encodeFeed([
      { tripId: 'trip-1', routeId: 'route-1', stops: [{ stopId: 'stop-A', arrival: now + 300 }] },
      { tripId: 'trip-2', routeId: 'route-2', stops: [{ stopId: 'stop-A', arrival: now + 600 }] },
    ])

    const result = decodeTripUpdates(buffer)

    expect(result).toHaveLength(2)
    expect(result[0].tripId).toBe('trip-1')
    expect(result[1].tripId).toBe('trip-2')
  })
})

describe('fetchTripUpdates', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('should fetch and decode from multiple URLs', async () => {
    const now = Math.floor(Date.now() / 1000)
    const buffer = encodeFeed([
      { tripId: 'trip-1', routeId: 'route-1', stops: [{ stopId: 'stop-A', arrival: now + 300 }] },
    ])

    // Create a clean ArrayBuffer copy to avoid byteOffset issues
    const cleanBuffer = new Uint8Array(buffer).buffer

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(cleanBuffer),
    })

    const result = await fetchTripUpdates(['https://example.com/tu1.pb', 'https://example.com/tu2.pb'])

    expect(result).toHaveLength(2)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('should return empty array on fetch error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await fetchTripUpdates(['https://example.com/tu.pb'])

    expect(result).toHaveLength(0)
  })

  it('should return empty array on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const result = await fetchTripUpdates(['https://example.com/tu.pb'])

    expect(result).toHaveLength(0)
  })
})
