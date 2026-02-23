import { z } from 'zod'
import { FAVORITE_STOPS_STORAGE_KEY } from '../config'
import type { FavoriteStop } from '../types'

const favoriteStopsSchema = z.array(
  z.object({
    stopId: z.string(),
    stopIds: z.array(z.string()),
    name: z.string(),
    position: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
  })
)

export function loadFavoriteStops(): readonly FavoriteStop[] {
  try {
    const raw = localStorage.getItem(FAVORITE_STOPS_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    return favoriteStopsSchema.parse(parsed)
  } catch {
    return []
  }
}

export function saveFavoriteStops(stops: readonly FavoriteStop[]): void {
  try {
    const serialized = JSON.stringify(stops)
    localStorage.setItem(FAVORITE_STOPS_STORAGE_KEY, serialized)
  } catch {
    // Silently ignore if localStorage is unavailable
  }
}

export function clearFavoriteStops(): void {
  try {
    localStorage.removeItem(FAVORITE_STOPS_STORAGE_KEY)
  } catch {
    // Silently ignore if localStorage is unavailable
  }
}
