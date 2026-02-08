import AdmZip from 'adm-zip'
import { parse } from 'csv-parse/sync'
import type { Config } from '../config.js'
import type { GtfsRoute, GtfsTrip, GtfsStop, GtfsStaticData } from '../../src/types.js'

interface CsvRouteRecord {
  readonly route_id: string
  readonly route_short_name: string
  readonly route_long_name: string
  readonly route_type: string
  readonly route_color: string
  readonly route_text_color: string
}

interface CsvTripRecord {
  readonly trip_id: string
  readonly route_id: string
  readonly trip_headsign: string
  readonly direction_id: string
}

interface CsvStopRecord {
  readonly stop_id: string
  readonly stop_name: string
  readonly stop_lat: string
  readonly stop_lon: string
}

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content
}

function parseCsv<T>(content: string): readonly T[] {
  return parse(stripBom(content), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as readonly T[]
}

export function parseRoutes(csv: string): ReadonlyMap<string, GtfsRoute> {
  const records = parseCsv<CsvRouteRecord>(csv)
  const entries: readonly [string, GtfsRoute][] = records.map((record) => [
    record.route_id,
    {
      routeId: record.route_id,
      shortName: record.route_short_name,
      longName: record.route_long_name,
      type: Number(record.route_type),
      color: record.route_color ? `#${record.route_color}` : '#000000',
      textColor: record.route_text_color ? `#${record.route_text_color}` : '#FFFFFF',
    },
  ])
  return new Map(entries)
}

export function parseTrips(csv: string): ReadonlyMap<string, GtfsTrip> {
  const records = parseCsv<CsvTripRecord>(csv)
  const entries: readonly [string, GtfsTrip][] = records.map((record) => [
    record.trip_id,
    {
      tripId: record.trip_id,
      routeId: record.route_id,
      headsign: record.trip_headsign,
      directionId: record.direction_id,
    },
  ])
  return new Map(entries)
}

export function parseStops(csv: string): ReadonlyMap<string, GtfsStop> {
  const records = parseCsv<CsvStopRecord>(csv)
  const entries: readonly [string, GtfsStop][] = records.map((record) => [
    record.stop_id,
    {
      stopId: record.stop_id,
      name: record.stop_name,
      lat: Number(record.stop_lat),
      lng: Number(record.stop_lon),
    },
  ])
  return new Map(entries)
}

async function downloadAndExtractZip(
  url: string,
): Promise<ReadonlyMap<string, string>> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download GTFS ZIP from ${url}: ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const zip = new AdmZip(buffer)
  const entries = zip.getEntries()

  const fileMap = new Map<string, string>()
  for (const entry of entries) {
    fileMap.set(entry.entryName, entry.getData().toString('utf-8'))
  }
  return fileMap
}

function mergeMaps<T>(
  urban: ReadonlyMap<string, T>,
  suburban: ReadonlyMap<string, T>,
): ReadonlyMap<string, T> {
  const merged = new Map<string, T>(urban)
  for (const [key, value] of suburban) {
    merged.set(key, value)
  }
  return merged
}

function extractCsvFromZip(
  files: ReadonlyMap<string, string>,
  filename: string,
): string {
  const content = files.get(filename)
  if (!content) {
    throw new Error(`Missing ${filename} in GTFS ZIP archive`)
  }
  return content
}

function parseGtfsFromZip(files: ReadonlyMap<string, string>): {
  readonly routes: ReadonlyMap<string, GtfsRoute>
  readonly trips: ReadonlyMap<string, GtfsTrip>
  readonly stops: ReadonlyMap<string, GtfsStop>
} {
  return {
    routes: parseRoutes(extractCsvFromZip(files, 'routes.txt')),
    trips: parseTrips(extractCsvFromZip(files, 'trips.txt')),
    stops: parseStops(extractCsvFromZip(files, 'stops.txt')),
  }
}

export async function loadGtfsStaticData(config: Config): Promise<GtfsStaticData> {
  const [urbanFiles, suburbanFiles] = await Promise.all([
    downloadAndExtractZip(config.GTFS_URBAN_STATIC_URL),
    downloadAndExtractZip(config.GTFS_SUBURBAN_STATIC_URL),
  ])

  const urban = parseGtfsFromZip(urbanFiles)
  const suburban = parseGtfsFromZip(suburbanFiles)

  return {
    routes: mergeMaps(urban.routes, suburban.routes),
    trips: mergeMaps(urban.trips, suburban.trips),
    stops: mergeMaps(urban.stops, suburban.stops),
  }
}
