import { describe, it, expect } from 'vitest'
import { buildRoutePaths, buildTripShapeMap, buildDefaultShapeMap } from '../services/route-path-builder.js'
import type { GtfsStaticData, ShapePoint, StopTimeEntry } from '../../src/types.js'

function createStaticData(overrides: Partial<GtfsStaticData> = {}): GtfsStaticData {
  return {
    routes: new Map([
      ['R1', { routeId: 'R1', shortName: 'T1', longName: 'Tram 1', type: 0, color: '#005CA9', textColor: '#FFFFFF' }],
    ]),
    trips: new Map([
      ['TR1', { tripId: 'TR1', routeId: 'R1', headsign: 'Mosson', directionId: '0' }],
    ]),
    stops: new Map([
      ['S1', { stopId: 'S1', name: 'Stop A', lat: 43.60, lng: 3.87 }],
      ['S2', { stopId: 'S2', name: 'Stop B', lat: 43.61, lng: 3.88 }],
      ['S3', { stopId: 'S3', name: 'Stop C', lat: 43.62, lng: 3.89 }],
    ]),
    ...overrides,
  }
}

describe('buildRoutePaths', () => {
  it('should build path from shapes when available', () => {
    const staticData = createStaticData({
      trips: new Map([
        ['TR1', { tripId: 'TR1', routeId: 'R1', headsign: 'Mosson', directionId: '0', shapeId: 'SH1' }],
      ]),
    })

    const stopTimes: StopTimeEntry[] = [
      { tripId: 'TR1', stopId: 'S1', sequence: 1 },
      { tripId: 'TR1', stopId: 'S2', sequence: 2 },
    ]

    const shapes: ReadonlyMap<string, readonly ShapePoint[]> = new Map([
      ['SH1', [
        { shapeId: 'SH1', lat: 43.600, lng: 3.870, sequence: 1 },
        { shapeId: 'SH1', lat: 43.605, lng: 3.875, sequence: 2 },
        { shapeId: 'SH1', lat: 43.610, lng: 3.880, sequence: 3 },
      ]],
    ])

    const paths = buildRoutePaths(staticData, stopTimes, shapes)

    expect(paths).toHaveLength(1)
    expect(paths[0].routeId).toBe('R1')
    expect(paths[0].shapeId).toBe('SH1')
    expect(paths[0].shortName).toBe('T1')
    expect(paths[0].color).toBe('#005CA9')
    expect(paths[0].type).toBe('tram')
    expect(paths[0].coordinates).toEqual([
      [3.870, 43.600],
      [3.875, 43.605],
      [3.880, 43.610],
    ])
  })

  it('should build path from stop sequence when no shapes available', () => {
    const staticData = createStaticData()

    const stopTimes: StopTimeEntry[] = [
      { tripId: 'TR1', stopId: 'S1', sequence: 1 },
      { tripId: 'TR1', stopId: 'S2', sequence: 2 },
      { tripId: 'TR1', stopId: 'S3', sequence: 3 },
    ]

    const shapes = new Map<string, readonly ShapePoint[]>()

    const paths = buildRoutePaths(staticData, stopTimes, shapes)

    expect(paths).toHaveLength(1)
    expect(paths[0].shapeId).toBe('fallback-R1')
    expect(paths[0].coordinates).toEqual([
      [3.87, 43.60],
      [3.88, 43.61],
      [3.89, 43.62],
    ])
  })

  it('should pick the trip with the most stops for a route', () => {
    const staticData = createStaticData({
      trips: new Map([
        ['TR1', { tripId: 'TR1', routeId: 'R1', headsign: 'Mosson', directionId: '0' }],
        ['TR2', { tripId: 'TR2', routeId: 'R1', headsign: 'Odysseum', directionId: '1' }],
      ]),
    })

    const stopTimes: StopTimeEntry[] = [
      { tripId: 'TR1', stopId: 'S1', sequence: 1 },
      { tripId: 'TR1', stopId: 'S2', sequence: 2 },
      { tripId: 'TR2', stopId: 'S1', sequence: 1 },
      { tripId: 'TR2', stopId: 'S2', sequence: 2 },
      { tripId: 'TR2', stopId: 'S3', sequence: 3 },
    ]

    const shapes = new Map<string, readonly ShapePoint[]>()

    const paths = buildRoutePaths(staticData, stopTimes, shapes)

    expect(paths).toHaveLength(1)
    expect(paths[0].coordinates).toHaveLength(3)
  })

  it('should skip routes with fewer than 2 coordinates', () => {
    const staticData = createStaticData()

    const stopTimes: StopTimeEntry[] = [
      { tripId: 'TR1', stopId: 'S1', sequence: 1 },
    ]

    const shapes = new Map<string, readonly ShapePoint[]>()

    const paths = buildRoutePaths(staticData, stopTimes, shapes)

    expect(paths).toHaveLength(0)
  })

  it('should skip routes with no matching trips', () => {
    const staticData = createStaticData({
      trips: new Map(),
    })

    const stopTimes: StopTimeEntry[] = []
    const shapes = new Map<string, readonly ShapePoint[]>()

    const paths = buildRoutePaths(staticData, stopTimes, shapes)

    expect(paths).toHaveLength(0)
  })

  it('should prefer shape data over stop sequence', () => {
    const staticData = createStaticData({
      trips: new Map([
        ['TR1', { tripId: 'TR1', routeId: 'R1', headsign: 'Mosson', directionId: '0', shapeId: 'SH1' }],
        ['TR2', { tripId: 'TR2', routeId: 'R1', headsign: 'Odysseum', directionId: '1' }],
      ]),
    })

    const stopTimes: StopTimeEntry[] = [
      { tripId: 'TR1', stopId: 'S1', sequence: 1 },
      { tripId: 'TR2', stopId: 'S1', sequence: 1 },
      { tripId: 'TR2', stopId: 'S2', sequence: 2 },
      { tripId: 'TR2', stopId: 'S3', sequence: 3 },
    ]

    const shapes = new Map([
      ['SH1', [
        { shapeId: 'SH1', lat: 43.600, lng: 3.870, sequence: 1 },
        { shapeId: 'SH1', lat: 43.610, lng: 3.880, sequence: 2 },
      ]],
    ])

    const paths = buildRoutePaths(staticData, stopTimes, shapes)

    expect(paths).toHaveLength(1)
    expect(paths[0].coordinates).toEqual([
      [3.870, 43.600],
      [3.880, 43.610],
    ])
  })

  it('should handle bus route type correctly', () => {
    const staticData = createStaticData({
      routes: new Map([
        ['R1', { routeId: 'R1', shortName: '6', longName: 'Bus 6', type: 3, color: '#FF0000', textColor: '#FFFFFF' }],
      ]),
    })

    const stopTimes: StopTimeEntry[] = [
      { tripId: 'TR1', stopId: 'S1', sequence: 1 },
      { tripId: 'TR1', stopId: 'S2', sequence: 2 },
    ]

    const shapes = new Map<string, readonly ShapePoint[]>()

    const paths = buildRoutePaths(staticData, stopTimes, shapes)

    expect(paths).toHaveLength(1)
    expect(paths[0].type).toBe('bus')
  })

  it('should handle multiple routes', () => {
    const staticData = createStaticData({
      routes: new Map([
        ['R1', { routeId: 'R1', shortName: 'T1', longName: 'Tram 1', type: 0, color: '#005CA9', textColor: '#FFFFFF' }],
        ['R2', { routeId: 'R2', shortName: '6', longName: 'Bus 6', type: 3, color: '#FF0000', textColor: '#FFFFFF' }],
      ]),
      trips: new Map([
        ['TR1', { tripId: 'TR1', routeId: 'R1', headsign: 'Mosson', directionId: '0' }],
        ['TR2', { tripId: 'TR2', routeId: 'R2', headsign: 'Centre', directionId: '0' }],
      ]),
    })

    const stopTimes: StopTimeEntry[] = [
      { tripId: 'TR1', stopId: 'S1', sequence: 1 },
      { tripId: 'TR1', stopId: 'S2', sequence: 2 },
      { tripId: 'TR2', stopId: 'S2', sequence: 1 },
      { tripId: 'TR2', stopId: 'S3', sequence: 2 },
    ]

    const shapes = new Map<string, readonly ShapePoint[]>()

    const paths = buildRoutePaths(staticData, stopTimes, shapes)

    expect(paths).toHaveLength(2)

    const t1 = paths.find((p) => p.shortName === 'T1')
    const b6 = paths.find((p) => p.shortName === '6')

    expect(t1).toBeDefined()
    expect(b6).toBeDefined()
    expect(t1!.type).toBe('tram')
    expect(b6!.type).toBe('bus')
  })

  describe('with overpassPaths', () => {
    const overpassPaths = new Map<string, readonly (readonly (readonly [number, number])[])[]>([
      ['1', [
        [
          [3.870, 43.600],
          [3.872, 43.602],
          [3.875, 43.605],
          [3.880, 43.610],
        ],
      ]],
    ])

    it('should prefer Overpass paths over stop sequences', () => {
      const staticData = createStaticData()

      const stopTimes: StopTimeEntry[] = [
        { tripId: 'TR1', stopId: 'S1', sequence: 1 },
        { tripId: 'TR1', stopId: 'S2', sequence: 2 },
      ]

      const shapes = new Map<string, readonly ShapePoint[]>()

      const paths = buildRoutePaths(staticData, stopTimes, shapes, overpassPaths)

      expect(paths).toHaveLength(1)
      expect(paths[0].coordinates).toHaveLength(4)
      expect(paths[0].coordinates[0]).toEqual([3.870, 43.600])
    })

    it('should prefer GTFS shapes over Overpass when shapes available', () => {
      const staticData = createStaticData({
        trips: new Map([
          ['TR1', { tripId: 'TR1', routeId: 'R1', headsign: 'Mosson', directionId: '0', shapeId: 'SH1' }],
        ]),
      })

      const stopTimes: StopTimeEntry[] = [
        { tripId: 'TR1', stopId: 'S1', sequence: 1 },
        { tripId: 'TR1', stopId: 'S2', sequence: 2 },
      ]

      const shapes = new Map([
        ['SH1', [
          { shapeId: 'SH1', lat: 43.600, lng: 3.870, sequence: 1 },
          { shapeId: 'SH1', lat: 43.610, lng: 3.880, sequence: 2 },
        ]],
      ])

      const paths = buildRoutePaths(staticData, stopTimes, shapes, overpassPaths)

      expect(paths).toHaveLength(1)
      // shapes have 2 points, Overpass has 4 — shapes should win
      expect(paths[0].coordinates).toHaveLength(2)
    })

    it('should match "T1" shortName to Overpass ref "1"', () => {
      const staticData = createStaticData()

      const stopTimes: StopTimeEntry[] = [
        { tripId: 'TR1', stopId: 'S1', sequence: 1 },
        { tripId: 'TR1', stopId: 'S2', sequence: 2 },
      ]

      const shapes = new Map<string, readonly ShapePoint[]>()

      const paths = buildRoutePaths(staticData, stopTimes, shapes, overpassPaths)

      expect(paths).toHaveLength(1)
      expect(paths[0].shortName).toBe('T1')
      expect(paths[0].coordinates).toEqual(overpassPaths.get('1')![0])
    })

    it('should fall back to GTFS when no Overpass match', () => {
      const staticData = createStaticData({
        routes: new Map([
          ['R1', { routeId: 'R1', shortName: '6', longName: 'Bus 6', type: 3, color: '#FF0000', textColor: '#FFFFFF' }],
        ]),
      })

      const stopTimes: StopTimeEntry[] = [
        { tripId: 'TR1', stopId: 'S1', sequence: 1 },
        { tripId: 'TR1', stopId: 'S2', sequence: 2 },
      ]

      const shapes = new Map<string, readonly ShapePoint[]>()

      const paths = buildRoutePaths(staticData, stopTimes, shapes, overpassPaths)

      expect(paths).toHaveLength(1)
      expect(paths[0].coordinates).toEqual([
        [3.87, 43.60],
        [3.88, 43.61],
      ])
    })

    it('should skip Overpass match with fewer than 2 points', () => {
      const shortOverpass = new Map<string, readonly (readonly (readonly [number, number])[])[]>([
        ['1', [[[3.870, 43.600]]]],
      ])

      const staticData = createStaticData()

      const stopTimes: StopTimeEntry[] = [
        { tripId: 'TR1', stopId: 'S1', sequence: 1 },
        { tripId: 'TR1', stopId: 'S2', sequence: 2 },
      ]

      const shapes = new Map<string, readonly ShapePoint[]>()

      const paths = buildRoutePaths(staticData, stopTimes, shapes, shortOverpass)

      expect(paths).toHaveLength(1)
      expect(paths[0].coordinates).toEqual([
        [3.87, 43.60],
        [3.88, 43.61],
      ])
    })

    it('should apply Overpass to bus routes without shapes', () => {
      const busOverpass = new Map<string, readonly (readonly (readonly [number, number])[])[]>([
        ['6', [
          [
            [3.870, 43.600],
            [3.872, 43.602],
            [3.875, 43.605],
          ],
        ]],
      ])

      const staticData = createStaticData({
        routes: new Map([
          ['R1', { routeId: 'R1', shortName: '6', longName: 'Bus 6', type: 3, color: '#FF0000', textColor: '#FFFFFF' }],
        ]),
      })

      const stopTimes: StopTimeEntry[] = [
        { tripId: 'TR1', stopId: 'S1', sequence: 1 },
        { tripId: 'TR1', stopId: 'S2', sequence: 2 },
      ]

      const shapes = new Map<string, readonly ShapePoint[]>()

      const paths = buildRoutePaths(staticData, stopTimes, shapes, busOverpass)

      expect(paths).toHaveLength(1)
      // Should use Overpass geometry (3 points), not stop sequence (2 points)
      expect(paths[0].coordinates).toHaveLength(3)
    })

    it('should work with undefined overpassPaths', () => {
      const staticData = createStaticData()

      const stopTimes: StopTimeEntry[] = [
        { tripId: 'TR1', stopId: 'S1', sequence: 1 },
        { tripId: 'TR1', stopId: 'S2', sequence: 2 },
      ]

      const shapes = new Map<string, readonly ShapePoint[]>()

      const paths = buildRoutePaths(staticData, stopTimes, shapes, undefined)

      expect(paths).toHaveLength(1)
      expect(paths[0].coordinates).toEqual([
        [3.87, 43.60],
        [3.88, 43.61],
      ])
    })
  })
})

describe('buildTripShapeMap', () => {
  it('should map tripId to shapeId when trip has shapeId', () => {
    const staticData = createStaticData({
      trips: new Map([
        ['TR1', { tripId: 'TR1', routeId: 'R1', headsign: 'Mosson', directionId: '0', shapeId: 'SH1' }],
      ]),
    })

    const result = buildTripShapeMap(staticData)

    expect(result.get('TR1')).toBe('SH1')
  })

  it('should use fallback shapeId when trip has no shapeId', () => {
    const staticData = createStaticData({
      trips: new Map([
        ['TR1', { tripId: 'TR1', routeId: 'R1', headsign: 'Mosson', directionId: '0' }],
      ]),
    })

    const result = buildTripShapeMap(staticData)

    expect(result.get('TR1')).toBe('fallback-R1')
  })

  it('should handle multiple trips', () => {
    const staticData = createStaticData({
      trips: new Map([
        ['TR1', { tripId: 'TR1', routeId: 'R1', headsign: 'Mosson', directionId: '0', shapeId: 'SH1' }],
        ['TR2', { tripId: 'TR2', routeId: 'R1', headsign: 'Odysseum', directionId: '1', shapeId: 'SH2' }],
        ['TR3', { tripId: 'TR3', routeId: 'R1', headsign: 'Mosson', directionId: '0' }],
      ]),
    })

    const result = buildTripShapeMap(staticData)

    expect(result.size).toBe(3)
    expect(result.get('TR1')).toBe('SH1')
    expect(result.get('TR2')).toBe('SH2')
    expect(result.get('TR3')).toBe('fallback-R1')
  })
})

describe('buildDefaultShapeMap', () => {
  it('should pick the most frequent shapeId per route', () => {
    const staticData = createStaticData({
      trips: new Map([
        ['TR1', { tripId: 'TR1', routeId: 'R1', headsign: 'Mosson', directionId: '0', shapeId: 'SH1' }],
        ['TR2', { tripId: 'TR2', routeId: 'R1', headsign: 'Odysseum', directionId: '1', shapeId: 'SH1' }],
        ['TR3', { tripId: 'TR3', routeId: 'R1', headsign: 'Mosson', directionId: '0', shapeId: 'SH2' }],
      ]),
    })

    const result = buildDefaultShapeMap(staticData)

    expect(result.get('R1')).toBe('SH1')
  })

  it('should use fallback when trips have no shapeId', () => {
    const staticData = createStaticData({
      trips: new Map([
        ['TR1', { tripId: 'TR1', routeId: 'R1', headsign: 'Mosson', directionId: '0' }],
        ['TR2', { tripId: 'TR2', routeId: 'R1', headsign: 'Odysseum', directionId: '1' }],
      ]),
    })

    const result = buildDefaultShapeMap(staticData)

    expect(result.get('R1')).toBe('fallback-R1')
  })

  it('should handle multiple routes', () => {
    const staticData = createStaticData({
      routes: new Map([
        ['R1', { routeId: 'R1', shortName: 'T1', longName: 'Tram 1', type: 0, color: '#005CA9', textColor: '#FFFFFF' }],
        ['R2', { routeId: 'R2', shortName: '6', longName: 'Bus 6', type: 3, color: '#FF0000', textColor: '#FFFFFF' }],
      ]),
      trips: new Map([
        ['TR1', { tripId: 'TR1', routeId: 'R1', headsign: 'Mosson', directionId: '0', shapeId: 'SH1' }],
        ['TR2', { tripId: 'TR2', routeId: 'R2', headsign: 'Centre', directionId: '0', shapeId: 'SH3' }],
      ]),
    })

    const result = buildDefaultShapeMap(staticData)

    expect(result.size).toBe(2)
    expect(result.get('R1')).toBe('SH1')
    expect(result.get('R2')).toBe('SH3')
  })
})
