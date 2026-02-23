import type {
  ApiResponse,
  BBox,
  GtfsRoute,
  GtfsStop,
  GtfsTrip,
  LineInfo,
  RoutePath,
  Stop,
  StopArrival,
  TripShapesData,
  Vehicle,
} from '../../src/types.js'
import { fetchVehiclePositions } from '../../server/services/gtfs-realtime.js'
import { fetchTripUpdates } from '../../server/services/gtfs-trip-update.js'
import { z } from 'zod'

// --- Cloudflare types ---

interface Env {
  ASSETS: { fetch(input: Request | URL | string): Promise<Response> }
}

interface CFContext {
  request: Request
  env: Env
  params: { catchall?: string[] }
  waitUntil(promise: Promise<unknown>): void
}

// --- GTFS real-time feed URLs ---

const GTFS_URLS = {
  URBAN_RT: 'https://data.montpellier3m.fr/GTFS/Urbain/VehiclePosition.pb',
  SUBURBAN_RT: 'https://data.montpellier3m.fr/GTFS/Suburbain/VehiclePosition.pb',
  URBAN_TU: 'https://data.montpellier3m.fr/GTFS/Urbain/TripUpdate.pb',
  SUBURBAN_TU: 'https://data.montpellier3m.fr/GTFS/Suburbain/TripUpdate.pb',
} as const

const ARRIVALS_CHUNKS = 50

// --- Module-scope caches (persist across invocations in same isolate) ---

let routesCache: ReadonlyMap<string, GtfsRoute> | null = null
let tripsCache: ReadonlyMap<string, GtfsTrip> | null = null
let stopsCache: ReadonlyMap<string, GtfsStop> | null = null
let stopRoutesCache: Readonly<Record<string, readonly string[]>> | null = null
let routePathsCache: readonly RoutePath[] | null = null
let tripStopsCache: Readonly<Record<string, readonly [string, number, number][]>> | null = null
let tripShapesCache: TripShapesData | null = null

// --- Asset loading helpers ---

async function fetchAsset(env: Env, requestUrl: string, path: string): Promise<Response> {
  const origin = new URL(requestUrl).origin
  const response = await env.ASSETS.fetch(new Request(`${origin}${path}`))
  if (!response.ok) {
    throw new Error(`Data file ${path} not found (${response.status}). Deploy with "pnpm deploy:cf".`)
  }
  return response
}

async function loadRoutes(env: Env, url: string): Promise<ReadonlyMap<string, GtfsRoute>> {
  if (routesCache) return routesCache
  const data = await (await fetchAsset(env, url, '/data/gtfs-routes.json')).json() as Record<string, GtfsRoute>
  routesCache = new Map(Object.entries(data))
  return routesCache
}

async function loadTrips(env: Env, url: string): Promise<ReadonlyMap<string, GtfsTrip>> {
  if (tripsCache) return tripsCache
  const data = await (await fetchAsset(env, url, '/data/gtfs-trips.json')).json() as Record<string, GtfsTrip>
  tripsCache = new Map(Object.entries(data))
  return tripsCache
}

async function loadStops(env: Env, url: string): Promise<ReadonlyMap<string, GtfsStop>> {
  if (stopsCache) return stopsCache
  const data = await (await fetchAsset(env, url, '/data/gtfs-stops.json')).json() as Record<string, GtfsStop>
  stopsCache = new Map(Object.entries(data))
  return stopsCache
}

async function loadStopRoutes(env: Env, url: string): Promise<Readonly<Record<string, readonly string[]>>> {
  if (stopRoutesCache) return stopRoutesCache
  stopRoutesCache = await (await fetchAsset(env, url, '/data/gtfs-stop-routes.json')).json() as Record<string, readonly string[]>
  return stopRoutesCache
}

async function loadRoutePaths(env: Env, url: string): Promise<readonly RoutePath[]> {
  if (routePathsCache) return routePathsCache
  routePathsCache = await (await fetchAsset(env, url, '/data/gtfs-route-paths.json')).json() as RoutePath[]
  return routePathsCache
}

async function loadTripStops(
  env: Env,
  url: string
): Promise<Readonly<Record<string, readonly [string, number, number][]>>> {
  if (tripStopsCache) return tripStopsCache
  tripStopsCache = await (await fetchAsset(env, url, '/data/gtfs-trip-stops.json')).json() as Record<string, [string, number, number][]>
  return tripStopsCache
}

async function loadTripShapes(env: Env, url: string): Promise<TripShapesData> {
  if (tripShapesCache) return tripShapesCache
  tripShapesCache = await (await fetchAsset(env, url, '/data/gtfs-trip-shapes.json')).json() as TripShapesData
  return tripShapesCache
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
  tripStops: Readonly<Record<string, readonly [string, number, number][]>>,
  vehicleLat: number,
  vehicleLng: number
): string | undefined {
  const stops = tripStops[tripId]
  if (!stops || stops.length < 2) return stops?.[0]?.[0]

  // Find the segment (pair of consecutive stops) closest to the vehicle
  let bestSegIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < stops.length - 1; i++) {
    const [, aLat, aLng] = stops[i]
    const [, bLat, bLng] = stops[i + 1]
    const d = distToSegmentSquared(vehicleLat, vehicleLng, aLat, aLng, bLat, bLng)
    if (d < bestDist) {
      bestDist = d
      bestSegIdx = i
    }
  }

  // The next stop is the end of the segment (stops are ordered in trip direction)
  return stops[bestSegIdx + 1][0]
}

function hashStopId(stopId: string): number {
  let hash = 0
  for (let i = 0; i < stopId.length; i++) {
    hash = ((hash << 5) - hash) + stopId.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash) % ARRIVALS_CHUNKS
}

// Arrivals chunks not cached in module scope (too many)
async function loadArrivalsChunk(
  env: Env,
  url: string,
  stopId: string
): Promise<Record<string, readonly [string, string][]>> {
  const chunkId = hashStopId(stopId)
  const data = await (await fetchAsset(env, url, `/data/arrivals/${chunkId}.json`)).json()
  return data as Record<string, [string, string][]>
}

// --- Response helpers ---

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function apiSuccess<T>(data: T): Response {
  return jsonResponse<ApiResponse<T>>({ success: true, data })
}

function apiError(error: string, status = 500): Response {
  return jsonResponse<ApiResponse<never>>({ success: false, error }, status)
}

// --- Timezone helper (Workers run in UTC, GTFS times are Europe/Paris) ---

function getNowDaySecondsInParis(): number {
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

// --- Route type helpers ---

function resolveRouteType(routeType: number): 'tram' | 'bus' {
  return routeType === 0 ? 'tram' : 'bus'
}

function resolveDirection(directionId: string): 'A' | 'B' {
  return directionId === '0' ? 'A' : 'B'
}

// --- API Handlers ---

async function handleVehicles(
  url: URL,
  env: Env,
  requestUrl: string
): Promise<Response> {
  const [routes, trips, tripStops] = await Promise.all([
    loadRoutes(env, requestUrl),
    loadTrips(env, requestUrl),
    loadTripStops(env, requestUrl),
  ])

  const lineFilter = url.searchParams.get('line') ?? undefined

  const rawPositions = await fetchVehiclePositions([
    GTFS_URLS.URBAN_RT,
    GTFS_URLS.SUBURBAN_RT,
  ])

  const vehicles: Vehicle[] = rawPositions
    .map((raw) => {
      const trip = trips.get(raw.tripId)
      if (!trip) return null
      const route = routes.get(trip.routeId)
      if (!route) return null

      const nextStopName = findNextStopName(raw.tripId, tripStops, raw.lat, raw.lng)

      return {
        vehicleId: raw.vehicleId,
        tripId: raw.tripId,
        position: { lat: raw.lat, lng: raw.lng },
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
    })
    .filter((v): v is Vehicle => v !== null)

  const filtered = lineFilter
    ? vehicles.filter((v) => v.line.name === lineFilter)
    : vehicles

  return apiSuccess<readonly Vehicle[]>(filtered)
}

async function handleLines(env: Env, requestUrl: string): Promise<Response> {
  const routes = await loadRoutes(env, requestUrl)

  const lines: LineInfo[] = Array.from(routes.values()).map((route) => ({
    id: route.routeId,
    name: route.shortName,
    type: resolveRouteType(route.type),
    color: route.color,
  }))

  const sorted = [...lines].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'tram' ? -1 : 1
    return a.name.localeCompare(b.name, 'fr')
  })

  return apiSuccess<readonly LineInfo[]>(sorted)
}

const bboxSchema = z
  .string()
  .transform((val) => val.split(',').map(Number))
  .pipe(
    z.tuple([
      z.number().finite(),
      z.number().finite(),
      z.number().finite(),
      z.number().finite(),
    ])
  )
  .transform(
    ([minLng, minLat, maxLng, maxLat]): BBox => ({ minLng, minLat, maxLng, maxLat })
  )

async function handleStops(
  url: URL,
  env: Env,
  requestUrl: string
): Promise<Response> {
  const [stops, stopRoutes] = await Promise.all([
    loadStops(env, requestUrl),
    loadStopRoutes(env, requestUrl),
  ])

  const bboxParam = url.searchParams.get('bbox')
  let bbox: BBox | undefined

  if (bboxParam) {
    const parsed = bboxSchema.safeParse(bboxParam)
    if (!parsed.success) {
      return apiError('Invalid bbox format. Expected: minLng,minLat,maxLng,maxLat', 400)
    }
    bbox = parsed.data
  }

  const allStops: Stop[] = Array.from(stops.values())
    .filter((s) => stopRoutes[s.stopId] !== undefined)
    .map((s) => ({
      stopId: s.stopId,
      name: s.name,
      position: { lat: s.lat, lng: s.lng },
      routeIds: stopRoutes[s.stopId] ?? [],
    }))

  const filtered = bbox
    ? allStops.filter(
        (stop) =>
          stop.position.lng >= bbox!.minLng &&
          stop.position.lng <= bbox!.maxLng &&
          stop.position.lat >= bbox!.minLat &&
          stop.position.lat <= bbox!.maxLat
      )
    : allStops

  return apiSuccess<readonly Stop[]>(filtered)
}

async function handleRoutePaths(env: Env, requestUrl: string): Promise<Response> {
  const paths = await loadRoutePaths(env, requestUrl)
  return apiSuccess<readonly RoutePath[]>(paths)
}

async function handleTripShapes(env: Env, requestUrl: string): Promise<Response> {
  const data = await loadTripShapes(env, requestUrl)
  return apiSuccess<TripShapesData>(data)
}

function gtfsTimeToSeconds(time: string): number {
  const parts = time.split(':')
  if (parts.length < 3) return -1
  return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])
}

async function handleStopArrivals(
  stopId: string,
  env: Env,
  requestUrl: string
): Promise<Response> {
  const [routes, trips, stops, arrivalsChunk] = await Promise.all([
    loadRoutes(env, requestUrl),
    loadTrips(env, requestUrl),
    loadStops(env, requestUrl),
    loadArrivalsChunk(env, requestUrl, stopId),
  ])

  const stop = stops.get(stopId)
  if (!stop) {
    return apiError(`Stop ${stopId} not found`, 404)
  }

  const tripUpdates = await fetchTripUpdates([
    GTFS_URLS.URBAN_TU,
    GTFS_URLS.SUBURBAN_TU,
  ])

  // Build arrivals from chunked stop_times data
  const stopEntries = arrivalsChunk[stopId] ?? []
  const nowEpoch = Math.floor(Date.now() / 1000)
  const nowDaySeconds = getNowDaySecondsInParis()
  const maxMinutes = 90

  // Index RT updates for this stop
  const rtIndex = new Map<string, { arrivalTime?: number }>()
  for (const update of tripUpdates) {
    if (update.stopId === stopId) {
      rtIndex.set(update.tripId, { arrivalTime: update.arrivalTime })
    }
  }

  const arrivals: StopArrival[] = []

  // Process static schedule entries
  for (const [tripId, arrivalTime] of stopEntries) {
    const trip = trips.get(tripId)
    if (!trip) continue
    const route = routes.get(trip.routeId)
    if (!route) continue

    const rtUpdate = rtIndex.get(tripId)
    let arrivalMinutes: number
    let isRealTime: boolean

    if (rtUpdate?.arrivalTime) {
      const diffSeconds = rtUpdate.arrivalTime - nowEpoch
      arrivalMinutes = Math.round(diffSeconds / 60)
      isRealTime = true
    } else {
      const arrivalDaySeconds = gtfsTimeToSeconds(arrivalTime)
      if (arrivalDaySeconds < 0) continue
      arrivalMinutes = Math.round((arrivalDaySeconds - nowDaySeconds) / 60)
      isRealTime = false
    }

    if (arrivalMinutes < 0 || arrivalMinutes > maxMinutes) continue

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

  // Add RT-only updates (trips not in static data for this stop)
  const staticTripIds = new Set(stopEntries.map(([tripId]) => tripId))
  for (const [tripId, rtData] of rtIndex) {
    if (staticTripIds.has(tripId) || !rtData.arrivalTime) continue
    const trip = trips.get(tripId)
    if (!trip) continue
    const route = routes.get(trip.routeId)
    if (!route) continue

    const diffSeconds = rtData.arrivalTime - nowEpoch
    const arrivalMinutes = Math.round(diffSeconds / 60)
    if (arrivalMinutes < 0 || arrivalMinutes > maxMinutes) continue

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

  arrivals.sort((a, b) => a.arrivalMinutes - b.arrivalMinutes)
  return apiSuccess<readonly StopArrival[]>(arrivals.slice(0, 20))
}

// --- Main request handler ---

export async function onRequest(context: CFContext): Promise<Response> {
  const { request, env, params } = context
  const url = new URL(request.url)

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: { ...CORS_HEADERS, 'Access-Control-Max-Age': '86400' },
    })
  }

  if (request.method !== 'GET') {
    return apiError('Method not allowed', 405)
  }

  try {
    const path = params.catchall?.join('/') ?? ''

    if (path === 'vehicles') {
      return await handleVehicles(url, env, request.url)
    }

    if (path === 'lines') {
      return await handleLines(env, request.url)
    }

    if (path === 'stops') {
      return await handleStops(url, env, request.url)
    }

    if (path === 'route-paths') {
      return await handleRoutePaths(env, request.url)
    }

    if (path === 'trip-shapes') {
      return await handleTripShapes(env, request.url)
    }

    const arrivalsMatch = path.match(/^stops\/([^/]+)\/arrivals$/)
    if (arrivalsMatch) {
      return await handleStopArrivals(arrivalsMatch[1], env, request.url)
    }

    return apiError('Not found', 404)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('API error:', error)
    return apiError(message)
  }
}
