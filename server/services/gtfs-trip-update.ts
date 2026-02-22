import GtfsRealtimeBindings from 'gtfs-realtime-bindings'

const { transit_realtime } = GtfsRealtimeBindings

export interface TripStopUpdate {
  readonly tripId: string
  readonly routeId: string
  readonly stopId: string
  readonly arrivalTime: number | undefined
  readonly departureTime: number | undefined
}

function toNumber(
  value: number | { toNumber(): number } | null | undefined
): number | undefined {
  if (value == null) {
    return undefined
  }
  if (typeof value === 'number') {
    return value
  }
  return Number(value)
}

function decodeTripUpdates(buffer: Uint8Array): readonly TripStopUpdate[] {
  const feed = transit_realtime.FeedMessage.decode(buffer)
  const updates: TripStopUpdate[] = []

  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate
    if (!tripUpdate?.trip?.tripId) {
      continue
    }

    const tripId = tripUpdate.trip.tripId
    const routeId = tripUpdate.trip.routeId ?? ''

    for (const stu of tripUpdate.stopTimeUpdate ?? []) {
      if (!stu.stopId) {
        continue
      }

      updates.push({
        tripId,
        routeId,
        stopId: stu.stopId,
        arrivalTime: toNumber(stu.arrival?.time),
        departureTime: toNumber(stu.departure?.time),
      })
    }
  }

  return updates
}

async function fetchTripUpdateFeed(
  url: string
): Promise<readonly TripStopUpdate[]> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`)
    }
    const buffer = new Uint8Array(await response.arrayBuffer())
    return decodeTripUpdates(buffer)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Failed to fetch TripUpdate from ${url}: ${message}`)
    return []
  }
}

export async function fetchTripUpdates(
  urls: readonly string[]
): Promise<readonly TripStopUpdate[]> {
  const results = await Promise.all(urls.map(fetchTripUpdateFeed))
  return results.flat()
}

export { decodeTripUpdates }
