// @vitest-environment jsdom
import { loadFavoriteStops, saveFavoriteStops, clearFavoriteStops } from '../services/stop-favorites-storage'
import { FAVORITE_STOPS_STORAGE_KEY } from '../config'
import type { FavoriteStop } from '../types'

const mockFavorite: FavoriteStop = {
  stopId: 's-001',
  stopIds: ['s-001', 's-002'],
  name: 'Comédie',
  position: { lat: 43.6085, lng: 3.8795 },
}

const mockFavorite2: FavoriteStop = {
  stopId: 's-010',
  stopIds: ['s-010'],
  name: 'Cévennes',
  position: { lat: 43.63, lng: 3.82 },
}

beforeEach(() => {
  localStorage.clear()
})

describe('loadFavoriteStops', () => {
  it('should return empty array when nothing stored', () => {
    const result = loadFavoriteStops()

    expect(result).toEqual([])
  })

  it('should return favorites from valid stored data', () => {
    localStorage.setItem(FAVORITE_STOPS_STORAGE_KEY, JSON.stringify([mockFavorite, mockFavorite2]))

    const result = loadFavoriteStops()

    expect(result).toHaveLength(2)
    expect(result[0].stopId).toBe('s-001')
    expect(result[1].stopId).toBe('s-010')
  })

  it('should return empty array on invalid JSON', () => {
    localStorage.setItem(FAVORITE_STOPS_STORAGE_KEY, 'not-json{{{')

    const result = loadFavoriteStops()

    expect(result).toEqual([])
  })

  it('should return empty array when schema is invalid', () => {
    localStorage.setItem(FAVORITE_STOPS_STORAGE_KEY, JSON.stringify([{ stopId: 123 }]))

    const result = loadFavoriteStops()

    expect(result).toEqual([])
  })

  it('should return empty array when stored value is not an array', () => {
    localStorage.setItem(FAVORITE_STOPS_STORAGE_KEY, JSON.stringify({ key: 'value' }))

    const result = loadFavoriteStops()

    expect(result).toEqual([])
  })

  it('should return empty array when position is missing', () => {
    localStorage.setItem(FAVORITE_STOPS_STORAGE_KEY, JSON.stringify([
      { stopId: 's-001', stopIds: ['s-001'], name: 'Test' },
    ]))

    const result = loadFavoriteStops()

    expect(result).toEqual([])
  })
})

describe('saveFavoriteStops', () => {
  it('should persist favorites to localStorage', () => {
    saveFavoriteStops([mockFavorite])

    const stored = localStorage.getItem(FAVORITE_STOPS_STORAGE_KEY)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].stopId).toBe('s-001')
  })

  it('should overwrite previous favorites', () => {
    saveFavoriteStops([mockFavorite])
    saveFavoriteStops([mockFavorite2])

    const stored = JSON.parse(localStorage.getItem(FAVORITE_STOPS_STORAGE_KEY)!)
    expect(stored).toHaveLength(1)
    expect(stored[0].stopId).toBe('s-010')
  })

  it('should save empty array for empty list', () => {
    saveFavoriteStops([mockFavorite])
    saveFavoriteStops([])

    const stored = JSON.parse(localStorage.getItem(FAVORITE_STOPS_STORAGE_KEY)!)
    expect(stored).toEqual([])
  })
})

describe('clearFavoriteStops', () => {
  it('should remove favorites from localStorage', () => {
    saveFavoriteStops([mockFavorite])

    clearFavoriteStops()

    expect(localStorage.getItem(FAVORITE_STOPS_STORAGE_KEY)).toBeNull()
  })

  it('should not throw when nothing is stored', () => {
    expect(() => clearFavoriteStops()).not.toThrow()
  })
})
