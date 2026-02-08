import type {
  GtfsStaticData,
  GtfsRoute,
  RoutePath,
  ShapePoint,
  StopTimeEntry,
} from '../../src/types.js'

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

export function buildRoutePaths(
  staticData: GtfsStaticData,
  stopTimes: readonly StopTimeEntry[],
  shapes: ReadonlyMap<string, readonly ShapePoint[]>
): readonly RoutePath[] {
  const stopTimesByTrip = groupStopTimesByTrip(stopTimes)
  const paths: RoutePath[] = []

  for (const route of staticData.routes.values()) {
    const bestTrip = findBestTripForRoute(
      route.routeId,
      staticData.trips,
      stopTimesByTrip
    )

    if (!bestTrip) {
      continue
    }

    let coordinates: readonly (readonly [number, number])[]

    if (bestTrip.shapeId) {
      const shapePoints = shapes.get(bestTrip.shapeId)
      if (shapePoints && shapePoints.length > 0) {
        coordinates = buildPathFromShape(shapePoints)
      } else {
        coordinates = buildFromStops(bestTrip.tripId, stopTimesByTrip, staticData)
      }
    } else {
      coordinates = buildFromStops(bestTrip.tripId, stopTimesByTrip, staticData)
    }

    if (coordinates.length < 2) {
      continue
    }

    paths.push({
      routeId: route.routeId,
      shortName: route.shortName,
      color: route.color,
      type: resolveRouteType(route.type),
      coordinates,
    })
  }

  return paths
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
