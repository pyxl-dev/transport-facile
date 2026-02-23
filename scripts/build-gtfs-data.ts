import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig } from '../server/config.js'
import { loadGtfsStaticData } from '../server/services/gtfs-static.js'
import { buildRoutePaths, buildTripShapeMap, buildDefaultShapeMap } from '../server/services/route-path-builder.js'
import { loadOverpassData } from '../server/services/overpass-cache.js'
import type { GtfsStop, GtfsTrip, Stop, StopTimeEntry } from '../src/types.js'

function mapToObject<V>(map: ReadonlyMap<string, V>): Record<string, V> {
  const obj: Record<string, V> = {}
  for (const [key, value] of map) {
    obj[key] = value
  }
  return obj
}

function hashStopId(stopId: string, totalChunks: number): number {
  let hash = 0
  for (let i = 0; i < stopId.length; i++) {
    hash = ((hash << 5) - hash) + stopId.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash) % totalChunks
}

function buildTripStops(
  stopTimes: readonly StopTimeEntry[],
  stops: ReadonlyMap<string, GtfsStop>
): Record<string, readonly [string, number, number][]> {
  const byTrip = new Map<string, { sequence: number; stopName: string; lat: number; lng: number }[]>()

  for (const st of stopTimes) {
    const stop = stops.get(st.stopId)
    if (!stop) continue

    const existing = byTrip.get(st.tripId)
    const entry = { sequence: st.sequence, stopName: stop.name, lat: stop.lat, lng: stop.lng }
    if (existing) {
      existing.push(entry)
    } else {
      byTrip.set(st.tripId, [entry])
    }
  }

  const result: Record<string, [string, number, number][]> = {}
  for (const [tripId, entries] of byTrip) {
    entries.sort((a, b) => a.sequence - b.sequence)
    // Deduplicate consecutive stops (same stop appears once)
    const deduped: [string, number, number][] = []
    for (const e of entries) {
      const last = deduped[deduped.length - 1]
      if (!last || last[0] !== e.stopName) {
        deduped.push([e.stopName, e.lat, e.lng])
      }
    }
    result[tripId] = deduped
  }

  return result
}

export function buildGroupedStops(
  stops: ReadonlyMap<string, GtfsStop>,
  stopRoutes: Readonly<Record<string, string[]>>
): readonly Stop[] {
  const groups = new Map<string, { stopIds: string[]; lats: number[]; lngs: number[]; routeIds: Set<string> }>()

  for (const s of stops.values()) {
    const routes = stopRoutes[s.stopId]
    if (!routes) continue

    const existing = groups.get(s.name)
    if (existing) {
      existing.stopIds.push(s.stopId)
      existing.lats.push(s.lat)
      existing.lngs.push(s.lng)
      for (const r of routes) {
        existing.routeIds.add(r)
      }
    } else {
      groups.set(s.name, {
        stopIds: [s.stopId],
        lats: [s.lat],
        lngs: [s.lng],
        routeIds: new Set(routes),
      })
    }
  }

  return Array.from(groups.entries()).map(([name, group]) => ({
    stopId: group.stopIds[0],
    stopIds: group.stopIds,
    name,
    position: {
      lat: group.lats.reduce((sum, v) => sum + v, 0) / group.lats.length,
      lng: group.lngs.reduce((sum, v) => sum + v, 0) / group.lngs.length,
    },
    routeIds: [...group.routeIds],
  }))
}

const ARRIVALS_CHUNKS = 50

function buildArrivalsChunks(
  stopTimes: readonly StopTimeEntry[]
): Map<number, Record<string, readonly [string, string][]>> {
  // Group stop times by stopId, then bucket into chunks
  const byStop = new Map<string, [string, string][]>()

  for (const st of stopTimes) {
    if (!st.arrivalTime) {
      continue
    }
    const existing = byStop.get(st.stopId)
    const entry: [string, string] = [st.tripId, st.arrivalTime]
    if (existing) {
      existing.push(entry)
    } else {
      byStop.set(st.stopId, [entry])
    }
  }

  // Distribute into chunks
  const chunks = new Map<number, Record<string, [string, string][]>>()
  for (let i = 0; i < ARRIVALS_CHUNKS; i++) {
    chunks.set(i, {})
  }

  for (const [stopId, entries] of byStop) {
    const chunkId = hashStopId(stopId, ARRIVALS_CHUNKS)
    const chunk = chunks.get(chunkId)!
    chunk[stopId] = entries
  }

  return chunks
}

async function main() {
  console.log('Building GTFS data for Cloudflare deployment...')

  const config = loadConfig()

  console.log('Downloading and parsing GTFS static data...')
  const result = await loadGtfsStaticData(config)

  console.log('Loading Overpass route data...')
  const overpassPaths = await loadOverpassData()

  console.log('Building route paths (GTFS shapes + Overpass + stop sequences)...')
  const routePaths = buildRoutePaths(
    result.staticData,
    result.stopTimes,
    result.shapes,
    overpassPaths
  )

  const outDir = join(process.cwd(), 'dist', 'data')
  mkdirSync(outDir, { recursive: true })

  console.log('Writing core data files...')

  writeFileSync(
    join(outDir, 'gtfs-routes.json'),
    JSON.stringify(mapToObject(result.staticData.routes))
  )

  writeFileSync(
    join(outDir, 'gtfs-trips.json'),
    JSON.stringify(mapToObject(result.staticData.trips))
  )

  writeFileSync(
    join(outDir, 'gtfs-stops.json'),
    JSON.stringify(mapToObject(result.staticData.stops))
  )

  writeFileSync(
    join(outDir, 'gtfs-route-paths.json'),
    JSON.stringify(routePaths)
  )

  // Trip shapes mapping (used by /api/trip-shapes for active shape filtering)
  console.log('Building trip-shapes mapping...')
  const tripShapeMap = buildTripShapeMap(result.staticData)
  const defaultShapeMap = buildDefaultShapeMap(result.staticData)
  const tripShapesData = {
    tripShapes: mapToObject(tripShapeMap),
    defaultShapes: mapToObject(defaultShapeMap),
  }
  const tripShapesJson = JSON.stringify(tripShapesData)
  writeFileSync(join(outDir, 'gtfs-trip-shapes.json'), tripShapesJson)

  // Trip stops index (used by /api/vehicles for nextStopName)
  console.log('Building trip-stops index...')
  const tripStops = buildTripStops(result.stopTimes, result.staticData.stops)
  const tripStopsJson = JSON.stringify(tripStops)
  writeFileSync(join(outDir, 'gtfs-trip-stops.json'), tripStopsJson)

  // Stop-to-routes mapping (used by /api/stops to filter and enrich)
  const stopRoutes: Record<string, string[]> = {}
  for (const st of result.stopTimes) {
    const trip = result.staticData.trips.get(st.tripId)
    if (!trip) continue
    const existing = stopRoutes[st.stopId]
    if (existing) {
      if (!existing.includes(trip.routeId)) {
        existing.push(trip.routeId)
      }
    } else {
      stopRoutes[st.stopId] = [trip.routeId]
    }
  }
  writeFileSync(
    join(outDir, 'gtfs-stop-routes.json'),
    JSON.stringify(stopRoutes)
  )

  // Grouped stops (stops merged by name with centroid position)
  console.log('Building grouped stops...')
  const groupedStops = buildGroupedStops(result.staticData.stops, stopRoutes)
  writeFileSync(
    join(outDir, 'gtfs-grouped-stops.json'),
    JSON.stringify(groupedStops)
  )

  // Arrivals chunks (used by /api/stops/:stopId/arrivals)
  console.log(`Building ${ARRIVALS_CHUNKS} arrivals chunks...`)
  const arrivalsDir = join(outDir, 'arrivals')
  mkdirSync(arrivalsDir, { recursive: true })

  const chunks = buildArrivalsChunks(result.stopTimes)
  let totalChunkSize = 0
  for (const [chunkId, chunkData] of chunks) {
    const json = JSON.stringify(chunkData)
    totalChunkSize += json.length
    writeFileSync(join(arrivalsDir, `${chunkId}.json`), json)
  }

  console.log('GTFS data built successfully:')
  console.log(`  Routes: ${result.staticData.routes.size}`)
  console.log(`  Trips: ${result.staticData.trips.size}`)
  console.log(`  Stops: ${result.staticData.stops.size}`)
  console.log(`  Stop times: ${result.stopTimes.length}`)
  console.log(`  Active stops: ${Object.keys(stopRoutes).length}`)
  console.log(`  Grouped stops: ${groupedStops.length} (from ${result.staticData.stops.size} raw)`)
  console.log(`  Route paths: ${routePaths.length}`)
  console.log(`  Trip-shapes: ${tripShapeMap.size} trips, ${defaultShapeMap.size} defaults (${(tripShapesJson.length / 1024 / 1024).toFixed(1)} MB)`)
  console.log(`  Trip-stops index: ${Object.keys(tripStops).length} trips (${(tripStopsJson.length / 1024 / 1024).toFixed(1)} MB)`)
  console.log(`  Arrivals chunks: ${ARRIVALS_CHUNKS} files (${(totalChunkSize / 1024 / 1024).toFixed(1)} MB total)`)
}

main().catch((error) => {
  console.error('Failed to build GTFS data:', error)
  process.exit(1)
})
