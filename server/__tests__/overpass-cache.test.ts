import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import {
  loadCacheFromDisk,
  saveCacheToDisk,
  loadOverpassData,
} from '../services/overpass-cache.js'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/overpass.js', () => ({
  fetchOverpassRoutes: vi.fn(),
}))

const mockReadFile = vi.mocked(readFile)
const mockWriteFile = vi.mocked(writeFile)

describe('loadCacheFromDisk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return parsed routes from valid cache file', async () => {
    const cacheData = {
      fetchedAt: '2026-02-20T10:00:00.000Z',
      routes: {
        '1': [[3.87, 43.6], [3.88, 43.61]],
        'T2': [[3.90, 43.7], [3.91, 43.71]],
      },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(cacheData))

    const result = await loadCacheFromDisk('/tmp/test-cache.json')

    expect(result).toBeDefined()
    expect(result!.routes.size).toBe(2)
    expect(result!.routes.get('1')).toEqual([[3.87, 43.6], [3.88, 43.61]])
    expect(result!.fetchedAt).toBe('2026-02-20T10:00:00.000Z')
  })

  it('should return undefined when cache file does not exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const result = await loadCacheFromDisk('/tmp/nonexistent.json')

    expect(result).toBeUndefined()
  })

  it('should return undefined when cache file contains invalid JSON', async () => {
    mockReadFile.mockResolvedValue('not json at all')

    const result = await loadCacheFromDisk('/tmp/bad.json')

    expect(result).toBeUndefined()
  })

  it('should return undefined when cache data is missing required fields', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ something: 'else' }))

    const result = await loadCacheFromDisk('/tmp/incomplete.json')

    expect(result).toBeUndefined()
  })
})

describe('saveCacheToDisk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should write cache data as JSON with fetchedAt timestamp', async () => {
    const routes = new Map<string, readonly (readonly [number, number])[]>([
      ['1', [[3.87, 43.6], [3.88, 43.61]]],
    ])

    await saveCacheToDisk(routes, '/tmp/test-cache.json')

    expect(mockWriteFile).toHaveBeenCalledOnce()
    const [path, content] = mockWriteFile.mock.calls[0]
    expect(path).toBe('/tmp/test-cache.json')

    const parsed = JSON.parse(content as string)
    expect(parsed.fetchedAt).toBeDefined()
    expect(parsed.routes['1']).toEqual([[3.87, 43.6], [3.88, 43.61]])
  })

  it('should create parent directory if needed', async () => {
    const routes = new Map<string, readonly (readonly [number, number])[]>()

    await saveCacheToDisk(routes, '/tmp/nested/dir/cache.json')

    expect(vi.mocked(mkdir)).toHaveBeenCalledWith('/tmp/nested/dir', { recursive: true })
  })
})

describe('loadOverpassData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return cached routes when cache file exists', async () => {
    const cacheData = {
      fetchedAt: new Date().toISOString(),
      routes: {
        '1': [[3.87, 43.6], [3.88, 43.61]],
      },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(cacheData))

    const result = await loadOverpassData('/tmp/test-cache.json')

    expect(result.size).toBe(1)
    expect(result.get('1')).toEqual([[3.87, 43.6], [3.88, 43.61]])
  })

  it('should not call Overpass API when cache exists', async () => {
    const { fetchOverpassRoutes } = await import('../services/overpass.js')
    const cacheData = {
      fetchedAt: new Date().toISOString(),
      routes: { '1': [[3.87, 43.6]] },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(cacheData))

    await loadOverpassData('/tmp/test-cache.json')

    expect(fetchOverpassRoutes).not.toHaveBeenCalled()
  })

  it('should fetch from API and save cache when no cache file exists', async () => {
    const { fetchOverpassRoutes } = await import('../services/overpass.js')
    const mockRoutes = new Map([
      ['1', [[3.87, 43.6], [3.88, 43.61]] as readonly (readonly [number, number])[]],
    ])
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    vi.mocked(fetchOverpassRoutes).mockResolvedValue(mockRoutes)

    const result = await loadOverpassData('/tmp/test-cache.json')

    expect(fetchOverpassRoutes).toHaveBeenCalledOnce()
    expect(result.size).toBe(1)
    expect(mockWriteFile).toHaveBeenCalledOnce()
  })

  it('should not save cache when API returns empty map', async () => {
    const { fetchOverpassRoutes } = await import('../services/overpass.js')
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    vi.mocked(fetchOverpassRoutes).mockResolvedValue(new Map())

    const result = await loadOverpassData('/tmp/test-cache.json')

    expect(result.size).toBe(0)
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('should refresh from API when cache is older than 7 days', async () => {
    const { fetchOverpassRoutes } = await import('../services/overpass.js')
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3_600_000).toISOString()
    const staleCache = {
      fetchedAt: eightDaysAgo,
      routes: { '1': [[3.87, 43.6]] },
    }
    const freshRoutes = new Map([
      ['1', [[3.87, 43.6], [3.88, 43.61]] as readonly (readonly [number, number])[]],
      ['2', [[3.90, 43.7]] as readonly (readonly [number, number])[]],
    ])
    mockReadFile.mockResolvedValue(JSON.stringify(staleCache))
    vi.mocked(fetchOverpassRoutes).mockResolvedValue(freshRoutes)

    const result = await loadOverpassData('/tmp/test-cache.json')

    expect(fetchOverpassRoutes).toHaveBeenCalledOnce()
    expect(result.size).toBe(2)
    expect(mockWriteFile).toHaveBeenCalledOnce()
  })

  it('should not refresh when cache is less than 7 days old', async () => {
    const { fetchOverpassRoutes } = await import('../services/overpass.js')
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString()
    const freshCache = {
      fetchedAt: threeDaysAgo,
      routes: { '1': [[3.87, 43.6]] },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(freshCache))

    await loadOverpassData('/tmp/test-cache.json')

    expect(fetchOverpassRoutes).not.toHaveBeenCalled()
  })

  it('should use stale cache when refresh fails', async () => {
    const { fetchOverpassRoutes } = await import('../services/overpass.js')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3_600_000).toISOString()
    const staleCache = {
      fetchedAt: tenDaysAgo,
      routes: { '1': [[3.87, 43.6]] },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(staleCache))
    vi.mocked(fetchOverpassRoutes).mockRejectedValue(new Error('API down'))

    const result = await loadOverpassData('/tmp/test-cache.json')

    expect(result.size).toBe(1)
    expect(result.get('1')).toEqual([[3.87, 43.6]])
  })

  it('should use stale cache when refresh returns empty map', async () => {
    const { fetchOverpassRoutes } = await import('../services/overpass.js')
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3_600_000).toISOString()
    const staleCache = {
      fetchedAt: tenDaysAgo,
      routes: { '1': [[3.87, 43.6]] },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(staleCache))
    vi.mocked(fetchOverpassRoutes).mockResolvedValue(new Map())

    const result = await loadOverpassData('/tmp/test-cache.json')

    expect(result.size).toBe(1)
    expect(result.get('1')).toEqual([[3.87, 43.6]])
    expect(mockWriteFile).not.toHaveBeenCalled()
  })
})
