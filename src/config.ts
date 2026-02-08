export const MAP_CENTER = { lat: 43.6108, lng: 3.8767 } as const
export const MAP_ZOOM = 13
export const STOP_VISIBLE_ZOOM = 14
export const POLLING_INTERVAL = 30_000
export const API_BASE_URL = '/api'

export const TRAM_LINES = ['T1', 'T2', 'T3', 'T4', 'T5'] as const

export const FAVORITES_STORAGE_KEY = 'tam-favorite-lines'

export const DEFAULT_LINE_COLORS: Record<string, string> = {
  T1: '#005CA9',
  T2: '#EE7F00',
  T3: '#82BE1E',
  T4: '#C3007A',
  T5: '#6E2585',
}
