import {
  fetchWithRetry,
  type FetchWithRetryOptions,
} from '../utils/fetch-with-retry.js'

interface OverpassGeometryPoint {
  readonly lat: number
  readonly lon: number
}

interface OverpassWayMember {
  readonly type: 'way'
  readonly ref: number
  readonly role: string
  readonly geometry: readonly OverpassGeometryPoint[]
}

interface OverpassNodeMember {
  readonly type: 'node'
  readonly ref: number
  readonly role: string
  readonly lat: number
  readonly lon: number
}

type OverpassMember = OverpassWayMember | OverpassNodeMember

interface OverpassRelation {
  readonly type: 'relation'
  readonly id: number
  readonly tags: {
    readonly ref?: string
    readonly name?: string
    readonly network?: string
    readonly route?: string
    readonly type?: string
  }
  readonly members: readonly OverpassMember[]
}

interface OverpassResponse {
  readonly elements: readonly OverpassRelation[]
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const OVERPASS_QUERY = [
  '[out:json];',
  '(',
  'relation["type"="route"]["route"="tram"](43.5,3.7,43.7,4.05);',
  'relation["type"="route"]["route"="bus"]["network"="TaM"](43.5,3.7,43.7,4.05);',
  ');',
  'out body geom;',
].join('')

type Coordinates = readonly (readonly [number, number])[]

function toCoord(p: OverpassGeometryPoint): readonly [number, number] {
  return [p.lon, p.lat] as const
}

// ~5m tolerance at Montpellier latitude (43.6°)
const NEAR_THRESHOLD = 0.0001

function pointsNear(
  a: readonly [number, number],
  b: readonly [number, number]
): boolean {
  return Math.abs(a[0] - b[0]) < NEAR_THRESHOLD &&
    Math.abs(a[1] - b[1]) < NEAR_THRESHOLD
}

function deduplicateConsecutivePoints(
  points: readonly (readonly [number, number])[]
): readonly (readonly [number, number])[] {
  if (points.length === 0) {
    return []
  }

  const result: (readonly [number, number])[] = [points[0]]

  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1]
    const curr = points[i]
    if (!pointsNear(prev, curr)) {
      result.push(curr)
    }
  }

  return result
}

function appendWayForward(
  chain: (readonly [number, number])[],
  wayCoords: readonly (readonly [number, number])[]
): void {
  for (let j = 1; j < wayCoords.length; j++) {
    chain.push(wayCoords[j])
  }
}

function appendWayReversed(
  chain: (readonly [number, number])[],
  wayCoords: readonly (readonly [number, number])[]
): void {
  for (let j = wayCoords.length - 2; j >= 0; j--) {
    chain.push(wayCoords[j])
  }
}

export function chainWayGeometries(
  wayMembers: readonly OverpassWayMember[]
): readonly (readonly [number, number])[] {
  if (wayMembers.length === 0) {
    return []
  }

  const firstWay = wayMembers[0].geometry.map(toCoord)
  if (firstWay.length === 0) {
    return []
  }

  const chain: (readonly [number, number])[] = [...firstWay]

  // Detect if first way needs reversing by looking ahead at way[1]
  if (wayMembers.length >= 2) {
    const nextCoords = wayMembers[1].geometry.map(toCoord)
    if (nextCoords.length > 0) {
      const chainEnd = chain[chain.length - 1]
      const chainStart = chain[0]
      const nextStart = nextCoords[0]
      const nextEnd = nextCoords[nextCoords.length - 1]

      const endConnects = pointsNear(chainEnd, nextStart) || pointsNear(chainEnd, nextEnd)
      const startConnects = pointsNear(chainStart, nextStart) || pointsNear(chainStart, nextEnd)

      if (!endConnects && startConnects) {
        chain.reverse()
      }
    }
  }

  for (let i = 1; i < wayMembers.length; i++) {
    const wayCoords = wayMembers[i].geometry.map(toCoord)
    if (wayCoords.length === 0) {
      continue
    }

    const chainEnd = chain[chain.length - 1]
    const wayStart = wayCoords[0]
    const wayEnd = wayCoords[wayCoords.length - 1]

    if (pointsNear(chainEnd, wayStart)) {
      appendWayForward(chain, wayCoords)
    } else if (pointsNear(chainEnd, wayEnd)) {
      appendWayReversed(chain, wayCoords)
    } else {
      // Gap: skip this way to avoid straight-line artifacts
      continue
    }
  }

  return deduplicateConsecutivePoints(chain)
}

export function parseOverpassRelations(
  response: OverpassResponse
): ReadonlyMap<string, Coordinates> {
  const byRef = new Map<string, { wayCount: number; coordinates: Coordinates }>()

  for (const element of response.elements) {
    if (element.type !== 'relation') {
      continue
    }

    const ref = element.tags.ref
    if (!ref) {
      continue
    }

    const wayMembers = element.members.filter(
      (m): m is OverpassWayMember => m.type === 'way'
    )

    if (wayMembers.length === 0) {
      continue
    }

    const coordinates = chainWayGeometries(wayMembers)

    const existing = byRef.get(ref)
    if (!existing || wayMembers.length > existing.wayCount) {
      byRef.set(ref, { wayCount: wayMembers.length, coordinates })
    }
  }

  const result = new Map<string, Coordinates>()
  for (const [ref, entry] of byRef) {
    result.set(ref, entry.coordinates)
  }

  return result
}

export async function fetchOverpassRoutes(
  retryOptions?: Partial<FetchWithRetryOptions>
): Promise<ReadonlyMap<string, Coordinates>> {
  try {
    const response = await fetchWithRetry(
      OVERPASS_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      },
      retryOptions
    )

    const data = (await response.json()) as OverpassResponse
    return parseOverpassRelations(data)
  } catch (error) {
    console.warn('Failed to fetch Overpass routes:', error)
    return new Map()
  }
}

function findLongestByPrefix(
  prefix: string,
  overpassPaths: ReadonlyMap<string, Coordinates>
): Coordinates | undefined {
  let best: Coordinates | undefined
  for (const [ref, coords] of overpassPaths) {
    if (ref.startsWith(prefix) && (!best || coords.length > best.length)) {
      best = coords
    }
  }
  return best
}

export function matchOverpassRef(
  shortName: string,
  overpassPaths: ReadonlyMap<string, Coordinates>
): Coordinates | undefined {
  // Direct match: shortName "1" → ref "1"
  const direct = overpassPaths.get(shortName)
  if (direct) {
    return direct
  }

  // Strip "T" prefix: shortName "T1" → ref "1"
  const bare = shortName.startsWith('T') ? shortName.slice(1) : undefined
  if (bare) {
    const match = overpassPaths.get(bare)
    if (match) {
      return match
    }
  }

  // Add "T" prefix: shortName "1" → ref "T1"
  const withPrefix = overpassPaths.get(`T${shortName}`)
  if (withPrefix) {
    return withPrefix
  }

  // Prefix match: shortName "4" → ref "4A" or "4B" (pick longest)
  const baseRef = bare ?? shortName
  const prefixMatch = findLongestByPrefix(baseRef, overpassPaths)
  if (prefixMatch) {
    return prefixMatch
  }

  return undefined
}
