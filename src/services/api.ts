import { API_BASE_URL } from '../config'
import type { ApiResponse, Vehicle, LineInfo, Stop, RoutePath, StopArrival, TripShapesData } from '../types'

async function fetchJson<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  const json: ApiResponse<T> = await response.json()
  if (!json.success) {
    throw new Error(json.error ?? 'Unknown API error')
  }

  return json.data as T
}

export function fetchVehicles(line?: string): Promise<Vehicle[]> {
  const params = line ? { line } : undefined
  return fetchJson<Vehicle[]>(`${API_BASE_URL}/vehicles`, params)
}

export function fetchLines(): Promise<LineInfo[]> {
  return fetchJson<LineInfo[]>(`${API_BASE_URL}/lines`)
}

function normalizeStops(stops: Stop[]): Stop[] {
  return stops.map((s) => ({
    ...s,
    stopIds: Array.isArray(s.stopIds) && s.stopIds.length > 0 ? s.stopIds : [s.stopId],
  }))
}

export async function fetchStops(bbox?: {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}): Promise<Stop[]> {
  const params = bbox
    ? {
        bbox: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
      }
    : undefined
  const stops = await fetchJson<Stop[]>(`${API_BASE_URL}/stops`, params)
  return normalizeStops(stops)
}

export function fetchRoutePaths(): Promise<RoutePath[]> {
  return fetchJson<RoutePath[]>(`${API_BASE_URL}/route-paths`)
}

export function fetchStopArrivals(stopId: string): Promise<StopArrival[]> {
  return fetchJson<StopArrival[]>(`${API_BASE_URL}/stops/${encodeURIComponent(stopId)}/arrivals`)
}

export function fetchTripShapes(): Promise<TripShapesData> {
  return fetchJson<TripShapesData>(`${API_BASE_URL}/trip-shapes`)
}
