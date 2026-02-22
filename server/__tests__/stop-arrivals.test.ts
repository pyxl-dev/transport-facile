import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildStopArrivals } from '../services/stop-arrivals.js'
import type { GtfsStaticData, StopTimeEntry } from '../../src/types.js'
import type { TripStopUpdate } from '../services/gtfs-trip-update.js'

function createStaticData(): GtfsStaticData {
  return {
    routes: new Map([
      ['route-1', { routeId: 'route-1', shortName: 'T1', longName: 'Tramway 1', type: 0, color: '#005CA9', textColor: '#FFFFFF' }],
      ['route-2', { routeId: 'route-2', shortName: '6', longName: 'Bus 6', type: 3, color: '#FF6600', textColor: '#FFFFFF' }],
    ]),
    trips: new Map([
      ['trip-1', { tripId: 'trip-1', routeId: 'route-1', headsign: 'Mosson', directionId: '0' }],
      ['trip-2', { tripId: 'trip-2', routeId: 'route-1', headsign: 'Odysseum', directionId: '1' }],
      ['trip-3', { tripId: 'trip-3', routeId: 'route-2', headsign: 'Centre', directionId: '0' }],
    ]),
    stops: new Map([
      ['stop-A', { stopId: 'stop-A', name: 'Comedie', lat: 43.61, lng: 3.88 }],
    ]),
  }
}

function nowTimeStr(offsetMinutes: number): string {
  const now = new Date()
  const totalMinutes = now.getHours() * 60 + now.getMinutes() + offsetMinutes
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

describe('buildStopArrivals', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return arrivals from static schedule sorted by time', () => {
    const staticData = createStaticData()
    const stopTimes: StopTimeEntry[] = [
      { tripId: 'trip-1', stopId: 'stop-A', sequence: 3, arrivalTime: nowTimeStr(10) },
      { tripId: 'trip-2', stopId: 'stop-A', sequence: 5, arrivalTime: nowTimeStr(5) },
      { tripId: 'trip-3', stopId: 'stop-A', sequence: 2, arrivalTime: nowTimeStr(15) },
    ]

    const result = buildStopArrivals('stop-A', staticData, stopTimes, [])

    expect(result).toHaveLength(3)
    expect(result[0].lineName).toBe('T1')
    expect(result[0].headsign).toBe('Odysseum')
    expect(result[0].arrivalMinutes).toBeLessThanOrEqual(6)
    expect(result[0].isRealTime).toBe(false)
    expect(result[1].arrivalMinutes).toBeLessThanOrEqual(11)
    expect(result[2].lineName).toBe('6')
  })

  it('should override static with real-time when available', () => {
    const staticData = createStaticData()
    const nowEpoch = Math.floor(Date.now() / 1000)
    const stopTimes: StopTimeEntry[] = [
      { tripId: 'trip-1', stopId: 'stop-A', sequence: 3, arrivalTime: nowTimeStr(10) },
    ]
    const tripUpdates: TripStopUpdate[] = [
      { tripId: 'trip-1', routeId: 'route-1', stopId: 'stop-A', arrivalTime: nowEpoch + 180, departureTime: undefined },
    ]

    const result = buildStopArrivals('stop-A', staticData, stopTimes, tripUpdates)

    expect(result).toHaveLength(1)
    expect(result[0].arrivalMinutes).toBe(3)
    expect(result[0].isRealTime).toBe(true)
  })

  it('should include RT-only trips not in static stop_times', () => {
    const staticData = createStaticData()
    const nowEpoch = Math.floor(Date.now() / 1000)
    const stopTimes: StopTimeEntry[] = []
    const tripUpdates: TripStopUpdate[] = [
      { tripId: 'trip-2', routeId: 'route-1', stopId: 'stop-A', arrivalTime: nowEpoch + 420, departureTime: undefined },
    ]

    const result = buildStopArrivals('stop-A', staticData, stopTimes, tripUpdates)

    expect(result).toHaveLength(1)
    expect(result[0].lineName).toBe('T1')
    expect(result[0].headsign).toBe('Odysseum')
    expect(result[0].isRealTime).toBe(true)
  })

  it('should filter out past arrivals', () => {
    const staticData = createStaticData()
    const stopTimes: StopTimeEntry[] = [
      { tripId: 'trip-1', stopId: 'stop-A', sequence: 3, arrivalTime: nowTimeStr(-5) },
    ]

    const result = buildStopArrivals('stop-A', staticData, stopTimes, [])

    expect(result).toHaveLength(0)
  })

  it('should filter out arrivals beyond maxMinutes', () => {
    const staticData = createStaticData()
    const stopTimes: StopTimeEntry[] = [
      { tripId: 'trip-1', stopId: 'stop-A', sequence: 3, arrivalTime: nowTimeStr(120) },
    ]

    const result = buildStopArrivals('stop-A', staticData, stopTimes, [], { maxMinutes: 60 })

    expect(result).toHaveLength(0)
  })

  it('should limit results to maxArrivals', () => {
    const staticData = createStaticData()
    const stopTimes: StopTimeEntry[] = [
      { tripId: 'trip-1', stopId: 'stop-A', sequence: 3, arrivalTime: nowTimeStr(5) },
      { tripId: 'trip-2', stopId: 'stop-A', sequence: 5, arrivalTime: nowTimeStr(10) },
      { tripId: 'trip-3', stopId: 'stop-A', sequence: 2, arrivalTime: nowTimeStr(15) },
    ]

    const result = buildStopArrivals('stop-A', staticData, stopTimes, [], { maxArrivals: 2 })

    expect(result).toHaveLength(2)
  })

  it('should return empty array for unknown stop', () => {
    const staticData = createStaticData()
    const stopTimes: StopTimeEntry[] = [
      { tripId: 'trip-1', stopId: 'stop-B', sequence: 1, arrivalTime: nowTimeStr(5) },
    ]

    const result = buildStopArrivals('stop-A', staticData, stopTimes, [])

    expect(result).toHaveLength(0)
  })

  it('should resolve tram type for route_type 0', () => {
    const staticData = createStaticData()
    const stopTimes: StopTimeEntry[] = [
      { tripId: 'trip-1', stopId: 'stop-A', sequence: 3, arrivalTime: nowTimeStr(5) },
    ]

    const result = buildStopArrivals('stop-A', staticData, stopTimes, [])

    expect(result[0].lineType).toBe('tram')
  })

  it('should resolve bus type for route_type 3', () => {
    const staticData = createStaticData()
    const stopTimes: StopTimeEntry[] = [
      { tripId: 'trip-3', stopId: 'stop-A', sequence: 2, arrivalTime: nowTimeStr(5) },
    ]

    const result = buildStopArrivals('stop-A', staticData, stopTimes, [])

    expect(result[0].lineType).toBe('bus')
  })
})
