import type {
  GtfsStaticData,
  GtfsRoute,
  RoutePath,
  ShapePoint,
  StopTimeEntry,
} from '../../src/types.js'
import { matchOverpassRef } from './overpass.js'

type Coordinates = readonly (readonly [number, number])[]

interface ShapeWithId {
  readonly shapeId: string
  readonly coordinates: Coordinates
}

const NEAR_THRESHOLD = 0.0001

function areSameTrack(
  a: Coordinates,
  b: Coordinates
): boolean {
  if (a.length < 2 || b.length < 2) {
    return false
  }
  const near = (p1: readonly [number, number], p2: readonly [number, number]) =>
    Math.abs(p1[0] - p2[0]) < NEAR_THRESHOLD && Math.abs(p1[1] - p2[1]) < NEAR_THRESHOLD
  return near(a[0], b[b.length - 1]) && near(a[a.length - 1], b[0])
}

function resolveRouteType(gtfsType: number): 'tram' | 'bus' {
  return gtfsType === 0 ? 'tram' : 'bus'
}

function groupStopTimesByTrip(
  stopTimes: readonly StopTimeEntry[]
): ReadonlyMap<string, readonly StopTimeEntry[]> {
  const grouped = new Map<string, StopTimeEntry[]>()
  for (const entry of stopTimes) {
    const existing = grouped.get(entry.tripId)
    if (existing) {
      existing.push(entry)
    } else {
      grouped.set(entry.tripId, [entry])
    }
  }

  const sorted = new Map<string, readonly StopTimeEntry[]>()
  for (const [tripId, entries] of grouped) {
    sorted.set(
      tripId,
      [...entries].sort((a, b) => a.sequence - b.sequence)
    )
  }
  return sorted
}

function buildPathFromShape(
  shapePoints: readonly ShapePoint[]
): readonly (readonly [number, number])[] {
  return shapePoints.map((p) => [p.lng, p.lat] as const)
}

function buildPathFromStopSequence(
  tripStopTimes: readonly StopTimeEntry[],
  stops: ReadonlyMap<string, { readonly lat: number; readonly lng: number }>
): readonly (readonly [number, number])[] {
  const coords: (readonly [number, number])[] = []
  for (const st of tripStopTimes) {
    const stop = stops.get(st.stopId)
    if (stop) {
      coords.push([stop.lng, stop.lat] as const)
    }
  }
  return coords
}

function findBestTripForRoute(
  routeId: string,
  trips: ReadonlyMap<string, { readonly tripId: string; readonly routeId: string; readonly shapeId?: string }>,
  stopTimesByTrip: ReadonlyMap<string, readonly StopTimeEntry[]>
): { tripId: string; shapeId?: string; stopCount: number } | undefined {
  let best: { tripId: string; shapeId?: string; stopCount: number } | undefined

  for (const trip of trips.values()) {
    if (trip.routeId !== routeId) {
      continue
    }

    const stopsForTrip = stopTimesByTrip.get(trip.tripId)
    const stopCount = stopsForTrip ? stopsForTrip.length : 0

    if (trip.shapeId) {
      if (!best || !best.shapeId || stopCount > best.stopCount) {
        best = { tripId: trip.tripId, shapeId: trip.shapeId, stopCount }
      }
    } else if (!best || (!best.shapeId && stopCount > best.stopCount)) {
      best = { tripId: trip.tripId, stopCount }
    }
  }

  return best
}

function findAllDistinctShapes(
  routeId: string,
  trips: ReadonlyMap<string, { readonly tripId: string; readonly routeId: string; readonly shapeId?: string }>,
  shapes: ReadonlyMap<string, readonly ShapePoint[]>
): readonly ShapeWithId[] {
  const shapeIds = new Set<string>()
  for (const trip of trips.values()) {
    if (trip.routeId === routeId && trip.shapeId) {
      shapeIds.add(trip.shapeId)
    }
  }

  const allPaths: ShapeWithId[] = []
  for (const shapeId of shapeIds) {
    const shapePoints = shapes.get(shapeId)
    if (shapePoints && shapePoints.length >= 2) {
      allPaths.push({ shapeId, coordinates: buildPathFromShape(shapePoints) })
    }
  }

  if (allPaths.length <= 1) {
    return allPaths
  }

  const kept: ShapeWithId[] = []
  for (const path of allPaths) {
    if (!kept.some((existing) => areSameTrack(path.coordinates, existing.coordinates))) {
      kept.push(path)
    }
  }
  return kept
}

function makeRoutePath(
  route: GtfsRoute,
  shapeId: string,
  coordinates: Coordinates
): RoutePath {
  return {
    routeId: route.routeId,
    shapeId,
    shortName: route.shortName,
    color: route.color,
    type: resolveRouteType(route.type),
    coordinates,
  }
}

export function buildRoutePaths(
  staticData: GtfsStaticData,
  stopTimes: readonly StopTimeEntry[],
  shapes: ReadonlyMap<string, readonly ShapePoint[]>,
  overpassPaths?: ReadonlyMap<string, readonly Coordinates[]>
): readonly RoutePath[] {
  const stopTimesByTrip = groupStopTimesByTrip(stopTimes)
  const paths: RoutePath[] = []

  for (const route of staticData.routes.values()) {
    const fallbackId = `fallback-${route.routeId}`

    // Priority 1: GTFS shapes (all distinct shapes, deduped)
    const shapePaths = findAllDistinctShapes(
      route.routeId,
      staticData.trips,
      shapes
    )
    if (shapePaths.length > 0) {
      for (const { shapeId, coordinates } of shapePaths) {
        paths.push(makeRoutePath(route, shapeId, coordinates))
      }
      continue
    }

    // Priority 2: Overpass OSM geometry (all branch variants)
    if (overpassPaths) {
      const overpassMatches = matchOverpassRef(route.shortName, overpassPaths)
      if (overpassMatches) {
        const valid = overpassMatches.filter((c) => c.length >= 2)
        if (valid.length > 0) {
          for (const coordinates of valid) {
            paths.push(makeRoutePath(route, fallbackId, coordinates))
          }
          continue
        }
      }
    }

    // Priority 3: Stop sequences (straight lines, last resort)
    const bestTrip = findBestTripForRoute(
      route.routeId,
      staticData.trips,
      stopTimesByTrip
    )
    if (bestTrip) {
      const coordinates = buildFromStops(bestTrip.tripId, stopTimesByTrip, staticData)
      if (coordinates.length >= 2) {
        paths.push(makeRoutePath(route, fallbackId, coordinates))
      }
    }
  }

  return paths
}

export function buildTripShapeMap(
  staticData: GtfsStaticData
): ReadonlyMap<string, string> {
  const result = new Map<string, string>()
  for (const trip of staticData.trips.values()) {
    const shapeId = trip.shapeId ?? `fallback-${trip.routeId}`
    result.set(trip.tripId, shapeId)
  }
  return result
}

export function buildDefaultShapeMap(
  staticData: GtfsStaticData
): ReadonlyMap<string, string> {
  // Count trips per shapeId per route
  const routeShapeCounts = new Map<string, Map<string, number>>()

  for (const trip of staticData.trips.values()) {
    const shapeId = trip.shapeId ?? `fallback-${trip.routeId}`
    const shapeCounts = routeShapeCounts.get(trip.routeId)
    if (shapeCounts) {
      shapeCounts.set(shapeId, (shapeCounts.get(shapeId) ?? 0) + 1)
    } else {
      routeShapeCounts.set(trip.routeId, new Map([[shapeId, 1]]))
    }
  }

  const result = new Map<string, string>()
  for (const [routeId, shapeCounts] of routeShapeCounts) {
    let bestShapeId = `fallback-${routeId}`
    let bestCount = 0
    for (const [shapeId, count] of shapeCounts) {
      if (count > bestCount) {
        bestCount = count
        bestShapeId = shapeId
      }
    }
    result.set(routeId, bestShapeId)
  }

  return result
}

function buildFromStops(
  tripId: string,
  stopTimesByTrip: ReadonlyMap<string, readonly StopTimeEntry[]>,
  staticData: GtfsStaticData
): readonly (readonly [number, number])[] {
  const tripStopTimes = stopTimesByTrip.get(tripId)
  if (!tripStopTimes) {
    return []
  }
  return buildPathFromStopSequence(tripStopTimes, staticData.stops)
}
