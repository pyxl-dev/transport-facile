import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig } from '../server/config.js'
import { loadGtfsStaticData } from '../server/services/gtfs-static.js'
import { buildRoutePaths } from '../server/services/route-path-builder.js'
import { loadOverpassData } from '../server/services/overpass-cache.js'
import type { GtfsStop, StopTimeEntry } from '../src/types.js'

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

function gtfsTimeToSeconds(time: string): number {
  const parts = time.split(':')
  if (parts.length < 3) return -1
  return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])
}

function buildTripStops(
  stopTimes: readonly StopTimeEntry[],
  stops: ReadonlyMap<string, GtfsStop>
): Record<string, readonly [number, string][]> {
  const byTrip = new Map<string, { sequence: number; arrivalSeconds: number; stopName: string }[]>()

  for (const st of stopTimes) {
    if (!st.arrivalTime) continue
    const arrivalSeconds = gtfsTimeToSeconds(st.arrivalTime)
    if (arrivalSeconds < 0) continue
    const stopName = stops.get(st.stopId)?.name
    if (!stopName) continue

    const existing = byTrip.get(st.tripId)
    const entry = { sequence: st.sequence, arrivalSeconds, stopName }
    if (existing) {
      existing.push(entry)
    } else {
      byTrip.set(st.tripId, [entry])
    }
  }

  const result: Record<string, [number, string][]> = {}
  for (const [tripId, entries] of byTrip) {
    entries.sort((a, b) => a.sequence - b.sequence)
    result[tripId] = entries.map((e) => [e.arrivalSeconds, e.stopName])
  }

  return result
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

  // Trip stops index (used by /api/vehicles for nextStopName)
  console.log('Building trip-stops index...')
  const tripStops = buildTripStops(result.stopTimes, result.staticData.stops)
  const tripStopsJson = JSON.stringify(tripStops)
  writeFileSync(join(outDir, 'gtfs-trip-stops.json'), tripStopsJson)

  // Active stop IDs (used by /api/stops to filter)
  const activeStopIds = [...new Set(result.stopTimes.map((st) => st.stopId))]
  writeFileSync(
    join(outDir, 'gtfs-active-stop-ids.json'),
    JSON.stringify(activeStopIds)
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
  console.log(`  Active stops: ${activeStopIds.length}`)
  console.log(`  Route paths: ${routePaths.length}`)
  console.log(`  Trip-stops index: ${Object.keys(tripStops).length} trips (${(tripStopsJson.length / 1024 / 1024).toFixed(1)} MB)`)
  console.log(`  Arrivals chunks: ${ARRIVALS_CHUNKS} files (${(totalChunkSize / 1024 / 1024).toFixed(1)} MB total)`)
}

main().catch((error) => {
  console.error('Failed to build GTFS data:', error)
  process.exit(1)
})
