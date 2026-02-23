import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fetchOverpassRoutes } from './overpass.js'

type Coordinates = readonly (readonly [number, number])[]

interface OverpassCacheData {
  readonly fetchedAt: string
  readonly routes: Record<string, readonly (readonly (readonly [number, number])[])[]>
}

const DEFAULT_CACHE_PATH = 'data/overpass-cache.json'

function mapToRecord(
  map: ReadonlyMap<string, readonly Coordinates[]>
): Record<string, readonly Coordinates[]> {
  const record: Record<string, readonly Coordinates[]> = {}
  for (const [key, value] of map) {
    record[key] = value
  }
  return record
}

function isOldCacheFormat(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) {
    return false
  }
  const first = value[0]
  return Array.isArray(first) && typeof first[0] === 'number'
}

function recordToMap(
  record: Record<string, unknown>
): ReadonlyMap<string, readonly Coordinates[]> {
  const map = new Map<string, readonly Coordinates[]>()
  for (const [key, value] of Object.entries(record)) {
    if (isOldCacheFormat(value)) {
      map.set(key, [value as Coordinates])
    } else {
      map.set(key, value as readonly Coordinates[])
    }
  }
  return map
}

export async function loadCacheFromDisk(
  cachePath: string = DEFAULT_CACHE_PATH
): Promise<{ routes: ReadonlyMap<string, readonly Coordinates[]>; fetchedAt: string } | undefined> {
  try {
    const raw = await readFile(cachePath, 'utf-8')
    const data = JSON.parse(raw) as { fetchedAt?: string; routes?: Record<string, unknown> }

    if (!data.fetchedAt || !data.routes) {
      return undefined
    }

    return {
      routes: recordToMap(data.routes),
      fetchedAt: data.fetchedAt,
    }
  } catch {
    return undefined
  }
}

export async function saveCacheToDisk(
  routes: ReadonlyMap<string, readonly Coordinates[]>,
  cachePath: string = DEFAULT_CACHE_PATH
): Promise<void> {
  const data: OverpassCacheData = {
    fetchedAt: new Date().toISOString(),
    routes: mapToRecord(routes),
  }

  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(data, null, 2), 'utf-8')
}

function formatCacheAge(fetchedAt: string): string {
  const ageMs = Date.now() - new Date(fetchedAt).getTime()
  const hours = Math.floor(ageMs / 3_600_000)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days}d ${hours % 24}h ago`
  }
  if (hours > 0) {
    return `${hours}h ago`
  }
  const minutes = Math.floor(ageMs / 60_000)
  return `${minutes}m ago`
}

const CACHE_MAX_AGE_MS = 7 * 24 * 3_600_000 // 7 days

function isCacheStale(fetchedAt: string): boolean {
  return Date.now() - new Date(fetchedAt).getTime() > CACHE_MAX_AGE_MS
}

async function refreshCache(
  cachePath: string,
  staleRoutes: ReadonlyMap<string, readonly Coordinates[]>
): Promise<ReadonlyMap<string, readonly Coordinates[]>> {
  console.info('Overpass cache is older than 7 days, refreshing from API...')
  try {
    const freshRoutes: ReadonlyMap<string, readonly Coordinates[]> = await fetchOverpassRoutes()
    if (freshRoutes.size > 0) {
      await saveCacheToDisk(freshRoutes, cachePath)
      console.info(`Overpass cache refreshed: ${freshRoutes.size} routes`)
      return freshRoutes
    }
  } catch (error) {
    console.warn('Failed to refresh Overpass cache:', error)
  }
  console.info('Using stale Overpass cache as fallback')
  return staleRoutes
}

export async function loadOverpassData(
  cachePath: string = DEFAULT_CACHE_PATH
): Promise<ReadonlyMap<string, readonly Coordinates[]>> {
  const cached = await loadCacheFromDisk(cachePath)

  if (cached) {
    console.info(
      `Overpass cache loaded: ${cached.routes.size} routes (fetched ${formatCacheAge(cached.fetchedAt)})`
    )

    if (isCacheStale(cached.fetchedAt)) {
      return refreshCache(cachePath, cached.routes)
    }

    return cached.routes
  }

  console.info('No Overpass cache found, fetching from API...')
  const routes = await fetchOverpassRoutes()

  if (routes.size > 0) {
    await saveCacheToDisk(routes, cachePath)
    console.info(`Overpass data cached to ${cachePath} (${routes.size} routes)`)
  }

  return routes
}
