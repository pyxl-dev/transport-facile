import GtfsRealtimeBindings from 'gtfs-realtime-bindings'

const { transit_realtime } = GtfsRealtimeBindings
import type { RawVehiclePosition } from '../../src/types.js'

function toNumber(value: number | { toNumber(): number } | null | undefined): number {
  if (value == null) {
    return 0
  }
  if (typeof value === 'number') {
    return value
  }
  return Number(value)
}

function decodeVehiclePositions(
  buffer: Uint8Array,
): readonly RawVehiclePosition[] {
  const feed = transit_realtime.FeedMessage.decode(buffer)

  return feed.entity
    .filter((entity) => entity.vehicle?.trip?.tripId && entity.vehicle?.vehicle?.id)
    .map((entity) => {
      const vehicle = entity.vehicle!
      return {
        vehicleId: vehicle.vehicle!.id!,
        tripId: vehicle.trip!.tripId!,
        lat: vehicle.position?.latitude ?? 0,
        lng: vehicle.position?.longitude ?? 0,
        bearing: vehicle.position?.bearing ?? 0,
        timestamp: toNumber(vehicle.timestamp),
      }
    })
}

async function fetchFeed(url: string): Promise<readonly RawVehiclePosition[]> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`)
    }
    const buffer = new Uint8Array(await response.arrayBuffer())
    return decodeVehiclePositions(buffer)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Failed to fetch GTFS-RT from ${url}: ${message}`)
    return []
  }
}

export async function fetchVehiclePositions(
  urls: readonly string[],
): Promise<readonly RawVehiclePosition[]> {
  const results = await Promise.all(urls.map(fetchFeed))
  return results.flat()
}
