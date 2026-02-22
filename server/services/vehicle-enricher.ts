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

function gtfsTimeToSeconds(time: string): number {
  const parts = time.split(':')
  if (parts.length < 3) return -1
  return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])
}

function buildTripStopIndex(
  stopTimes: readonly StopTimeEntry[]
): ReadonlyMap<string, readonly StopTimeEntry[]> {
  const index = new Map<string, StopTimeEntry[]>()
  for (const st of stopTimes) {
    const existing = index.get(st.tripId)
    if (existing) {
      existing.push(st)
    } else {
      index.set(st.tripId, [st])
    }
  }
  for (const entries of index.values()) {
    entries.sort((a, b) => a.sequence - b.sequence)
  }
  return index
}

function findNextStopName(
  tripId: string,
  tripStopIndex: ReadonlyMap<string, readonly StopTimeEntry[]>,
  stops: ReadonlyMap<string, GtfsStop>,
  nowDaySeconds: number
): string | undefined {
  const entries = tripStopIndex.get(tripId)
  if (!entries) return undefined

  for (const st of entries) {
    if (!st.arrivalTime) continue
    const arrivalSeconds = gtfsTimeToSeconds(st.arrivalTime)
    if (arrivalSeconds < 0) continue
    if (arrivalSeconds > nowDaySeconds) {
      return stops.get(st.stopId)?.name
    }
  }
  return undefined
}

export function enrichVehicles(
  rawPositions: readonly RawVehiclePosition[],
  staticData: GtfsStaticData,
  stopTimes?: readonly StopTimeEntry[],
): readonly Vehicle[] {
  const tripStopIndex = stopTimes ? buildTripStopIndex(stopTimes) : undefined
  const now = new Date()
  const nowDaySeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()

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
          ? findNextStopName(raw.tripId, tripStopIndex, staticData.stops, nowDaySeconds)
          : undefined

      const vehicle: Vehicle = {
        vehicleId: raw.vehicleId,
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
