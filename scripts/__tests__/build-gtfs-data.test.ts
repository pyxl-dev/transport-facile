import { buildGroupedStops } from '../build-gtfs-data.js'
import type { GtfsStop } from '../../src/types.js'

describe('buildGroupedStops', () => {
  function makeStop(stopId: string, name: string, lat: number, lng: number): GtfsStop {
    return { stopId, name, lat, lng }
  }

  it('merges two stops with the same name into one with centroid position', () => {
    const stops = new Map<string, GtfsStop>([
      ['S1', makeStop('S1', 'Cougourlude', 43.6, 3.8)],
      ['S2', makeStop('S2', 'Cougourlude', 43.62, 3.82)],
    ])
    const stopRoutes: Record<string, string[]> = {
      S1: ['R1'],
      S2: ['R1', 'R2'],
    }

    const result = buildGroupedStops(stops, stopRoutes)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Cougourlude')
    expect(result[0].stopId).toBe('S1')
    expect(result[0].stopIds).toEqual(['S1', 'S2'])
    expect(result[0].position.lat).toBeCloseTo(43.61, 5)
    expect(result[0].position.lng).toBeCloseTo(3.81, 5)
    expect(result[0].routeIds).toEqual(expect.arrayContaining(['R1', 'R2']))
    expect(result[0].routeIds).toHaveLength(2)
  })

  it('keeps unique stops as single entries', () => {
    const stops = new Map<string, GtfsStop>([
      ['S1', makeStop('S1', 'Mosson', 43.6, 3.8)],
      ['S2', makeStop('S2', 'Sabines', 43.61, 3.81)],
    ])
    const stopRoutes: Record<string, string[]> = {
      S1: ['R1'],
      S2: ['R2'],
    }

    const result = buildGroupedStops(stops, stopRoutes)

    expect(result).toHaveLength(2)
    const names = result.map((s) => s.name).sort()
    expect(names).toEqual(['Mosson', 'Sabines'])
  })

  it('excludes stops without routes in stopRoutes', () => {
    const stops = new Map<string, GtfsStop>([
      ['S1', makeStop('S1', 'Orphan', 43.6, 3.8)],
      ['S2', makeStop('S2', 'Active', 43.61, 3.81)],
    ])
    const stopRoutes: Record<string, string[]> = {
      S2: ['R1'],
    }

    const result = buildGroupedStops(stops, stopRoutes)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Active')
  })

  it('deduplicates routeIds across stops with the same name', () => {
    const stops = new Map<string, GtfsStop>([
      ['S1', makeStop('S1', 'Gare', 43.6, 3.8)],
      ['S2', makeStop('S2', 'Gare', 43.62, 3.82)],
    ])
    const stopRoutes: Record<string, string[]> = {
      S1: ['R1', 'R2'],
      S2: ['R2', 'R3'],
    }

    const result = buildGroupedStops(stops, stopRoutes)

    expect(result).toHaveLength(1)
    expect(result[0].routeIds).toEqual(expect.arrayContaining(['R1', 'R2', 'R3']))
    expect(result[0].routeIds).toHaveLength(3)
  })

  it('includes stop with empty routes array in stopRoutes', () => {
    const stops = new Map<string, GtfsStop>([
      ['S1', makeStop('S1', 'EmptyRoutes', 43.6, 3.8)],
      ['S2', makeStop('S2', 'HasRoutes', 43.61, 3.81)],
    ])
    const stopRoutes: Record<string, string[]> = {
      S1: [],
      S2: ['R1'],
    }

    const result = buildGroupedStops(stops, stopRoutes)

    expect(result).toHaveLength(2)
    const emptyStop = result.find((s) => s.name === 'EmptyRoutes')
    expect(emptyStop).toBeDefined()
    expect(emptyStop!.routeIds).toEqual([])
  })

  it('returns empty array for empty input', () => {
    const stops = new Map<string, GtfsStop>()
    const stopRoutes: Record<string, string[]> = {}

    const result = buildGroupedStops(stops, stopRoutes)

    expect(result).toHaveLength(0)
  })
})
