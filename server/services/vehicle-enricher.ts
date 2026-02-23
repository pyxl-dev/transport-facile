import type {
  RawVehiclePosition,
  GtfsStaticData,
  GtfsStop,
  Vehicle,
  StopTimeEntry,
} from '../../src/types.js'

function resolveRouteType(routeType: number): 'tram' | 'bus' {
  return routeType === 0 ? 'tram' : 'bus'
}

interface TripStopEntry {
  readonly stopName: string
  readonly lat: number
  readonly lng: number
}

function buildTripStopIndex(
  stopTimes: readonly StopTimeEntry[],
  stops: ReadonlyMap<string, GtfsStop>
): ReadonlyMap<string, readonly TripStopEntry[]> {
  const index = new Map<string, { sequence: number; stopName: string; lat: number; lng: number }[]>()
  for (const st of stopTimes) {
    const stop = stops.get(st.stopId)
    if (!stop) continue
    const existing = index.get(st.tripId)
    const entry = { sequence: st.sequence, stopName: stop.name, lat: stop.lat, lng: stop.lng }
    if (existing) {
      existing.push(entry)
    } else {
      index.set(st.tripId, [entry])
    }
  }
  const result = new Map<string, TripStopEntry[]>()
  for (const [tripId, entries] of index) {
    entries.sort((a, b) => a.sequence - b.sequence)
    // Deduplicate consecutive same-name stops
    const deduped: TripStopEntry[] = []
    for (const e of entries) {
      const last = deduped[deduped.length - 1]
      if (!last || last.stopName !== e.stopName) {
        deduped.push({ stopName: e.stopName, lat: e.lat, lng: e.lng })
      }
    }
    result.set(tripId, deduped)
  }
  return result
}

function distToSegmentSquared(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number
): number {
  const cosLat = Math.cos(pLat * Math.PI / 180)
  const ax = (aLng - pLng) * cosLat, ay = aLat - pLat
  const bx = (bLng - pLng) * cosLat, by = bLat - pLat
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return ax * ax + ay * ay
  const t = Math.max(0, Math.min(1, ((-ax) * dx + (-ay) * dy) / lenSq))
  const projX = ax + t * dx, projY = ay + t * dy
  return projX * projX + projY * projY
}

function findNextStopName(
  tripId: string,
  tripStopIndex: ReadonlyMap<string, readonly TripStopEntry[]>,
  vehicleLat: number,
  vehicleLng: number
): string | undefined {
  const stops = tripStopIndex.get(tripId)
  if (!stops || stops.length < 2) return stops?.[0]?.stopName

  let bestSegIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < stops.length - 1; i++) {
    const d = distToSegmentSquared(
      vehicleLat, vehicleLng,
      stops[i].lat, stops[i].lng,
      stops[i + 1].lat, stops[i + 1].lng
    )
    if (d < bestDist) {
      bestDist = d
      bestSegIdx = i
    }
  }

  return stops[bestSegIdx + 1].stopName
}

export function enrichVehicles(
  rawPositions: readonly RawVehiclePosition[],
  staticData: GtfsStaticData,
  stopTimes?: readonly StopTimeEntry[],
): readonly Vehicle[] {
  const tripStopIndex = stopTimes ? buildTripStopIndex(stopTimes, staticData.stops) : undefined

  return rawPositions
    .map((raw) => {
      const trip = staticData.trips.get(raw.tripId)
      if (!trip) {
        return null
      }

      const route = staticData.routes.get(trip.routeId)
      if (!route) {
        return null
      }

      const nextStopName = raw.stopId
        ? staticData.stops.get(raw.stopId)?.name
        : tripStopIndex
          ? findNextStopName(raw.tripId, tripStopIndex, raw.lat, raw.lng)
          : undefined

      const vehicle: Vehicle = {
        vehicleId: raw.vehicleId,
        tripId: raw.tripId,
        position: {
          lat: raw.lat,
          lng: raw.lng,
        },
        bearing: raw.bearing,
        line: {
          id: route.routeId,
          name: route.shortName,
          type: resolveRouteType(route.type),
          color: route.color,
        },
        headsign: trip.headsign,
        directionId: trip.directionId,
        timestamp: raw.timestamp,
        nextStopName,
      }

      return vehicle
    })
    .filter((vehicle): vehicle is Vehicle => vehicle !== null)
}
