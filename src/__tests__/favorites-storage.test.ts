// @vitest-environment jsdom
import { loadFavorites, saveFavorites, clearStoredFavorites } from '../services/favorites-storage'
import { FAVORITES_STORAGE_KEY } from '../config'

beforeEach(() => {
  localStorage.clear()
})

describe('loadFavorites', () => {
  it('should return empty set when nothing stored', () => {
    const result = loadFavorites()

    expect(result.size).toBe(0)
  })

  it('should return set from valid stored data', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(['T1', 'T2']))

    const result = loadFavorites()

    expect(result.size).toBe(2)
    expect(result.has('T1')).toBe(true)
    expect(result.has('T2')).toBe(true)
  })

  it('should return empty set on invalid JSON', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, 'not-json{{{')

    const result = loadFavorites()

    expect(result.size).toBe(0)
  })

  it('should return empty set when schema is invalid', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([123, true]))

    const result = loadFavorites()

    expect(result.size).toBe(0)
  })

  it('should return empty set when array contains empty strings', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(['T1', '']))

    const result = loadFavorites()

    expect(result.size).toBe(0)
  })

  it('should return empty set when stored value is not an array', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({ key: 'value' }))

    const result = loadFavorites()

    expect(result.size).toBe(0)
  })
})

describe('saveFavorites', () => {
  it('should persist favorites to localStorage', () => {
    saveFavorites(new Set(['T1', 'T3']))

    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toEqual(expect.arrayContaining(['T1', 'T3']))
  })

  it('should overwrite previous favorites', () => {
    saveFavorites(new Set(['T1']))
    saveFavorites(new Set(['T2', 'T3']))

    const stored = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)!)
    expect(stored).toHaveLength(2)
    expect(stored).toEqual(expect.arrayContaining(['T2', 'T3']))
  })

  it('should save empty array for empty set', () => {
    saveFavorites(new Set(['T1']))
    saveFavorites(new Set())

    const stored = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)!)
    expect(stored).toEqual([])
  })
})

describe('clearStoredFavorites', () => {
  it('should remove favorites from localStorage', () => {
    saveFavorites(new Set(['T1', 'T2']))

    clearStoredFavorites()

    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBeNull()
  })

  it('should not throw when nothing is stored', () => {
    expect(() => clearStoredFavorites()).not.toThrow()
  })
})
