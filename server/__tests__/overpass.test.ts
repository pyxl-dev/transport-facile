import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseOverpassRelations,
  chainWayGeometries,
  fetchOverpassTramRoutes,
  matchOverpassRef,
} from '../services/overpass.js'

function createRelation(
  ref: string,
  ways: { geometry: { lat: number; lon: number }[] }[],
  id = 1
) {
  return {
    type: 'relation' as const,
    id,
    tags: { ref, route: 'tram', type: 'route', network: 'TaM' },
    members: [
      { type: 'node' as const, ref: 100, role: 'stop', lat: 43.6, lon: 3.87 },
      ...ways.map((w, i) => ({
        type: 'way' as const,
        ref: 200 + i,
        role: '',
        geometry: w.geometry,
      })),
    ],
  }
}

describe('parseOverpassRelations', () => {
  it('should extract coordinates from way members', () => {
    const response = {
      elements: [
        createRelation('1', [
          {
            geometry: [
              { lat: 43.6, lon: 3.87 },
              { lat: 43.61, lon: 3.88 },
            ],
          },
          {
            geometry: [
              { lat: 43.61, lon: 3.88 },
              { lat: 43.62, lon: 3.89 },
            ],
          },
        ]),
      ],
    }

    const result = parseOverpassRelations(response)

    expect(result.size).toBe(1)
    expect(result.get('1')).toEqual([
      [3.87, 43.6],
      [3.88, 43.61],
      [3.89, 43.62],
    ])
  })

  it('should deduplicate consecutive identical points', () => {
    const response = {
      elements: [
        createRelation('2', [
          {
            geometry: [
              { lat: 43.6, lon: 3.87 },
              { lat: 43.61, lon: 3.88 },
            ],
          },
          {
            geometry: [
              { lat: 43.61, lon: 3.88 },
              { lat: 43.62, lon: 3.89 },
            ],
          },
        ]),
      ],
    }

    const result = parseOverpassRelations(response)
    const coords = result.get('2')!

    expect(coords).toHaveLength(3)
    expect(coords[1]).toEqual([3.88, 43.61])
  })

  it('should keep non-consecutive duplicate points', () => {
    const response = {
      elements: [
        createRelation('3', [
          {
            geometry: [
              { lat: 43.6, lon: 3.87 },
              { lat: 43.61, lon: 3.88 },
              { lat: 43.6, lon: 3.87 },
            ],
          },
        ]),
      ],
    }

    const result = parseOverpassRelations(response)
    const coords = result.get('3')!

    expect(coords).toHaveLength(3)
  })

  it('should keep the relation with the most way members when ref duplicated', () => {
    const response = {
      elements: [
        createRelation(
          '1',
          [
            {
              geometry: [
                { lat: 43.6, lon: 3.87 },
                { lat: 43.61, lon: 3.88 },
              ],
            },
          ],
          1
        ),
        createRelation(
          '1',
          [
            {
              geometry: [
                { lat: 43.7, lon: 3.90 },
                { lat: 43.71, lon: 3.91 },
              ],
            },
            {
              geometry: [
                { lat: 43.71, lon: 3.91 },
                { lat: 43.72, lon: 3.92 },
              ],
            },
            {
              geometry: [
                { lat: 43.72, lon: 3.92 },
                { lat: 43.73, lon: 3.93 },
              ],
            },
          ],
          2
        ),
      ],
    }

    const result = parseOverpassRelations(response)

    expect(result.size).toBe(1)
    const coords = result.get('1')!
    expect(coords[0]).toEqual([3.90, 43.7])
  })

  it('should skip relations without ref tag', () => {
    const response = {
      elements: [
        {
          type: 'relation' as const,
          id: 1,
          tags: { route: 'tram', type: 'route' },
          members: [
            {
              type: 'way' as const,
              ref: 200,
              role: '',
              geometry: [
                { lat: 43.6, lon: 3.87 },
                { lat: 43.61, lon: 3.88 },
              ],
            },
          ],
        },
      ],
    }

    const result = parseOverpassRelations(response)

    expect(result.size).toBe(0)
  })

  it('should skip relations without way members', () => {
    const response = {
      elements: [
        {
          type: 'relation' as const,
          id: 1,
          tags: { ref: '1', route: 'tram', type: 'route' },
          members: [
            {
              type: 'node' as const,
              ref: 100,
              role: 'stop',
              lat: 43.6,
              lon: 3.87,
            },
          ],
        },
      ],
    }

    const result = parseOverpassRelations(response)

    expect(result.size).toBe(0)
  })

  it('should handle empty response', () => {
    const result = parseOverpassRelations({ elements: [] })

    expect(result.size).toBe(0)
  })

  it('should convert lat/lon to [lon, lat] GeoJSON order', () => {
    const response = {
      elements: [
        createRelation('5', [
          {
            geometry: [
              { lat: 43.6123, lon: 3.8765 },
              { lat: 43.6234, lon: 3.8876 },
            ],
          },
        ]),
      ],
    }

    const result = parseOverpassRelations(response)
    const coords = result.get('5')!

    expect(coords[0]).toEqual([3.8765, 43.6123])
    expect(coords[1]).toEqual([3.8876, 43.6234])
  })
})

describe('chainWayGeometries', () => {
  function way(geometry: { lat: number; lon: number }[]) {
    return { type: 'way' as const, ref: 1, role: '', geometry }
  }

  it('should chain ways that follow naturally (end matches start)', () => {
    const ways = [
      way([
        { lat: 43.60, lon: 3.87 },
        { lat: 43.61, lon: 3.88 },
      ]),
      way([
        { lat: 43.61, lon: 3.88 },
        { lat: 43.62, lon: 3.89 },
      ]),
    ]

    const result = chainWayGeometries(ways)

    expect(result).toEqual([
      [3.87, 43.60],
      [3.88, 43.61],
      [3.89, 43.62],
    ])
  })

  it('should reverse a way when end matches end', () => {
    // way1: A→B, way2: C→B (reversed relative to chain direction)
    const ways = [
      way([
        { lat: 43.60, lon: 3.87 },
        { lat: 43.61, lon: 3.88 },
      ]),
      way([
        { lat: 43.62, lon: 3.89 },
        { lat: 43.61, lon: 3.88 },
      ]),
    ]

    const result = chainWayGeometries(ways)

    expect(result).toEqual([
      [3.87, 43.60],
      [3.88, 43.61],
      [3.89, 43.62],
    ])
  })

  it('should handle a mix of normal and reversed ways', () => {
    // way1: A→B (normal), way2: C→B (reversed), way3: C→D (normal)
    const ways = [
      way([
        { lat: 43.60, lon: 3.87 },
        { lat: 43.61, lon: 3.88 },
      ]),
      way([
        { lat: 43.62, lon: 3.89 },
        { lat: 43.61, lon: 3.88 },
      ]),
      way([
        { lat: 43.62, lon: 3.89 },
        { lat: 43.63, lon: 3.90 },
      ]),
    ]

    const result = chainWayGeometries(ways)

    expect(result).toEqual([
      [3.87, 43.60],
      [3.88, 43.61],
      [3.89, 43.62],
      [3.90, 43.63],
    ])
  })

  it('should handle a single way', () => {
    const ways = [
      way([
        { lat: 43.60, lon: 3.87 },
        { lat: 43.61, lon: 3.88 },
      ]),
    ]

    const result = chainWayGeometries(ways)

    expect(result).toEqual([
      [3.87, 43.60],
      [3.88, 43.61],
    ])
  })

  it('should handle empty way list', () => {
    const result = chainWayGeometries([])

    expect(result).toEqual([])
  })

  it('should handle gap between ways (no matching endpoints)', () => {
    const ways = [
      way([
        { lat: 43.60, lon: 3.87 },
        { lat: 43.61, lon: 3.88 },
      ]),
      way([
        { lat: 43.70, lon: 3.95 },
        { lat: 43.71, lon: 3.96 },
      ]),
    ]

    const result = chainWayGeometries(ways)

    expect(result).toEqual([
      [3.87, 43.60],
      [3.88, 43.61],
      [3.95, 43.70],
      [3.96, 43.71],
    ])
  })
})

describe('matchOverpassRef', () => {
  const paths = new Map<string, readonly (readonly [number, number])[]>([
    [
      '1',
      [
        [3.87, 43.6],
        [3.88, 43.61],
      ],
    ],
    [
      '4A',
      [
        [3.90, 43.7],
        [3.91, 43.71],
      ],
    ],
    [
      '4B',
      [
        [3.92, 43.72],
        [3.93, 43.73],
        [3.94, 43.74],
      ],
    ],
  ])

  it('should match shortName "T1" to ref "1" by stripping T prefix', () => {
    const result = matchOverpassRef('T1', paths)

    expect(result).toEqual([
      [3.87, 43.6],
      [3.88, 43.61],
    ])
  })

  it('should match shortName "1" directly', () => {
    const result = matchOverpassRef('1', paths)

    expect(result).toEqual([
      [3.87, 43.6],
      [3.88, 43.61],
    ])
  })

  it('should match shortName "T4A" to ref "4A"', () => {
    const result = matchOverpassRef('T4A', paths)

    expect(result).toEqual([
      [3.90, 43.7],
      [3.91, 43.71],
    ])
  })

  it('should return undefined when no match found', () => {
    const result = matchOverpassRef('T99', paths)

    expect(result).toBeUndefined()
  })

  it('should match shortName "4" to longest ref starting with "4" (prefix match)', () => {
    const result = matchOverpassRef('4', paths)

    // 4B has 3 points vs 4A has 2 points, so 4B is picked
    expect(result).toEqual([
      [3.92, 43.72],
      [3.93, 43.73],
      [3.94, 43.74],
    ])
  })

  it('should match shortName "T4" to longest ref starting with "4" (strip T + prefix match)', () => {
    const result = matchOverpassRef('T4', paths)

    expect(result).toEqual([
      [3.92, 43.72],
      [3.93, 43.73],
      [3.94, 43.74],
    ])
  })

  it('should try adding T prefix for reverse match', () => {
    const pathsWithT = new Map<string, readonly (readonly [number, number])[]>([
      [
        'T1',
        [
          [3.87, 43.6],
          [3.88, 43.61],
        ],
      ],
    ])

    const result = matchOverpassRef('1', pathsWithT)

    expect(result).toEqual([
      [3.87, 43.6],
      [3.88, 43.61],
    ])
  })
})

describe('fetchOverpassTramRoutes', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('should return parsed routes on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          elements: [
            createRelation('1', [
              {
                geometry: [
                  { lat: 43.6, lon: 3.87 },
                  { lat: 43.61, lon: 3.88 },
                ],
              },
            ]),
          ],
        }),
    })

    const result = await fetchOverpassTramRoutes()

    expect(result.size).toBe(1)
    expect(result.get('1')).toBeDefined()
  })

  it('should return empty map on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    })

    const result = await fetchOverpassTramRoutes()

    expect(result.size).toBe(0)
  })

  it('should return empty map on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await fetchOverpassTramRoutes()

    expect(result.size).toBe(0)
  })

  it('should POST to Overpass API with correct parameters', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ elements: [] }),
    })

    await fetchOverpassTramRoutes()

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://overpass-api.de/api/interpreter',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    )
  })
})
