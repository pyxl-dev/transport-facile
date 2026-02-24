import type {
  GtfsStaticData,
  StopTimeEntry,
  StopArrival,
} from '../../src/types.js'
import type { TripStopUpdate } from './gtfs-trip-update.js'

function gtfsTimeToTodaySeconds(gtfsTime: string): number {
  const parts = gtfsTime.split(':')
  if (parts.length < 3) {
    return -1
  }
  const h = Number(parts[0])
  const m = Number(parts[1])
  const s = Number(parts[2])
  return h * 3600 + m * 60 + s
}

function currentDaySeconds(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(new Date())

  const hours = Number(parts.find((p) => p.type === 'hour')!.value)
  const minutes = Number(parts.find((p) => p.type === 'minute')!.value)
  const seconds = Number(parts.find((p) => p.type === 'second')!.value)
  return hours * 3600 + minutes * 60 + seconds
}

function resolveRouteType(gtfsType: number): 'tram' | 'bus' {
  return gtfsType === 0 ? 'tram' : 'bus'
}

function resolveDirection(directionId: string): 'A' | 'B' {
  return directionId === '0' ? 'A' : 'B'
}

export interface StopArrivalsOptions {
  readonly maxArrivals?: number
  readonly maxMinutes?: number
}

export function buildStopArrivals(
  stopId: string,
  staticData: GtfsStaticData,
  stopTimes: readonly StopTimeEntry[],
  tripUpdates: readonly TripStopUpdate[],
  options: StopArrivalsOptions = {}
): readonly StopArrival[] {
  const maxArrivals = options.maxArrivals ?? 20
  const maxMinutes = options.maxMinutes ?? 90

  const nowEpoch = Math.floor(Date.now() / 1000)
  const nowDaySeconds = currentDaySeconds()
  const maxDaySeconds = nowDaySeconds + maxMinutes * 60

  const arrivals: StopArrival[] = []

  // Index real-time updates by tripId+stopId for fast lookup
  const rtIndex = new Map<string, TripStopUpdate>()
  for (const update of tripUpdates) {
    if (update.stopId === stopId) {
      rtIndex.set(update.tripId, update)
    }
  }

  // Find static stop_times for this stop
  const stopStopTimes = stopTimes.filter((st) => st.stopId === stopId)

  for (const st of stopStopTimes) {
    const trip = staticData.trips.get(st.tripId)
    if (!trip) {
      continue
    }

    const route = staticData.routes.get(trip.routeId)
    if (!route) {
      continue
    }

    const rtUpdate = rtIndex.get(st.tripId)

    let arrivalMinutes: number
    let isRealTime: boolean

    if (rtUpdate?.arrivalTime) {
      // Real-time arrival (epoch seconds)
      const diffSeconds = rtUpdate.arrivalTime - nowEpoch
      arrivalMinutes = Math.round(diffSeconds / 60)
      isRealTime = true
    } else if (st.arrivalTime) {
      // Static schedule
      const arrivalDaySeconds = gtfsTimeToTodaySeconds(st.arrivalTime)
      if (arrivalDaySeconds < 0) {
        continue
      }
      const diffSeconds = arrivalDaySeconds - nowDaySeconds
      arrivalMinutes = Math.round(diffSeconds / 60)
      isRealTime = false
    } else {
      continue
    }

    // Filter: only future arrivals within the window
    if (arrivalMinutes < 0 || arrivalMinutes > maxMinutes) {
      continue
    }

    arrivals.push({
      lineName: route.shortName,
      lineColor: route.color,
      lineType: resolveRouteType(route.type),
      direction: resolveDirection(trip.directionId),
      headsign: trip.headsign,
      arrivalMinutes,
      isRealTime,
    })
  }

  // Also add RT updates for trips not found in static stop_times
  for (const [tripId, rtUpdate] of rtIndex) {
    const alreadyAdded = stopStopTimes.some((st) => st.tripId === tripId)
    if (alreadyAdded) {
      continue
    }

    if (!rtUpdate.arrivalTime) {
      continue
    }

    const trip = staticData.trips.get(tripId)
    if (!trip) {
      continue
    }

    const route = staticData.routes.get(trip.routeId)
    if (!route) {
      continue
    }

    const diffSeconds = rtUpdate.arrivalTime - nowEpoch
    const arrivalMinutes = Math.round(diffSeconds / 60)

    if (arrivalMinutes < 0 || arrivalMinutes > maxMinutes) {
      continue
    }

    arrivals.push({
      lineName: route.shortName,
      lineColor: route.color,
      lineType: resolveRouteType(route.type),
      direction: resolveDirection(trip.directionId),
      headsign: trip.headsign,
      arrivalMinutes,
      isRealTime: true,
    })
  }

  // Sort by arrival time, take top N
  arrivals.sort((a, b) => a.arrivalMinutes - b.arrivalMinutes)
  return arrivals.slice(0, maxArrivals)
}
