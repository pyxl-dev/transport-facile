import { z } from 'zod'
import { FAVORITES_STORAGE_KEY } from '../config'

const favoritesSchema = z.array(z.string().min(1))

export function loadFavorites(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY)
    if (!raw) {
      return new Set<string>()
    }
    const parsed: unknown = JSON.parse(raw)
    const validated = favoritesSchema.parse(parsed)
    return new Set(validated)
  } catch {
    return new Set<string>()
  }
}

export function saveFavorites(favorites: ReadonlySet<string>): void {
  try {
    const serialized = JSON.stringify([...favorites])
    localStorage.setItem(FAVORITES_STORAGE_KEY, serialized)
  } catch {
    // Silently ignore if localStorage is unavailable
  }
}

export function clearStoredFavorites(): void {
  try {
    localStorage.removeItem(FAVORITES_STORAGE_KEY)
  } catch {
    // Silently ignore if localStorage is unavailable
  }
}
