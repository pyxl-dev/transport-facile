import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Express } from 'express'
import type {
  GtfsStaticData,
  GtfsRoute,
  GtfsTrip,
  GtfsStop,
  Vehicle,
} from '../../src/types.js'
import type { Config } from '../config.js'
import { createApp } from '../app.js'

vi.mock('../services/gtfs-realtime.js', () => ({
  fetchVehiclePositions: vi.fn(),
}))

vi.mock('../services/vehicle-enricher.js', () => ({
  enrichVehicles: vi.fn(),
}))

import { fetchVehiclePositions } from '../services/gtfs-realtime.js'
import { enrichVehicles } from '../services/vehicle-enricher.js'

const mockedFetchVehiclePositions = vi.mocked(fetchVehiclePositions)
const mockedEnrichVehicles = vi.mocked(enrichVehicles)

function createTestConfig(): Config {
  return {
    PORT: 3000,
    GTFS_URBAN_RT_URL: 'https://example.com/urban.pb',
    GTFS_SUBURBAN_RT_URL: 'https://example.com/suburban.pb',
    GTFS_URBAN_STATIC_URL: 'https://example.com/urban.zip',
    GTFS_SUBURBAN_STATIC_URL: 'https://example.com/suburban.zip',
    GTFS_REFRESH_INTERVAL: 30000,
  }
}

function createTestStaticData(): GtfsStaticData {
  const routes = new Map<string, GtfsRoute>([
    ['r1', { routeId: 'r1', shortName: 'T1', longName: 'Tramway 1', type: 0, color: '#0055A4', textColor: '#FFFFFF' }],
    ['r2', { routeId: 'r2', shortName: 'T2', longName: 'Tramway 2', type: 0, color: '#EF7D00', textColor: '#000000' }],
    ['r3', { routeId: 'r3', shortName: '10', longName: 'Bus 10', type: 3, color: '#00A651', textColor: '#FFFFFF' }],
    ['r4', { routeId: 'r4', shortName: '6', longName: 'Bus 6', type: 3, color: '#D3006C', textColor: '#FFFFFF' }],
  ])

  const trips = new Map<string, GtfsTrip>([
    ['t1', { tripId: 't1', routeId: 'r1', headsign: 'Mosson', directionId: '0' }],
    ['t2', { tripId: 't2', routeId: 'r3', headsign: 'Centre', directionId: '1' }],
  ])

  const stops = new Map<string, GtfsStop>([
    ['s1', { stopId: 's1', name: 'Comedie', lat: 43.6085, lng: 3.8795 }],
    ['s2', { stopId: 's2', name: 'Gare Saint-Roch', lat: 43.6045, lng: 3.8810 }],
    ['s3', { stopId: 's3', name: 'Mosson', lat: 43.6200, lng: 3.8200 }],
    ['s4', { stopId: 's4', name: 'Odysseum', lat: 43.6050, lng: 3.9200 }],
  ])

  return { routes, trips, stops }
}

function createTestVehicles(): Vehicle[] {
  return [
    {
      vehicleId: 'v1',
      position: { lat: 43.6085, lng: 3.8795 },
      bearing: 90,
      line: { id: 'r1', name: 'T1', type: 'tram', color: '#0055A4' },
      headsign: 'Mosson',
      timestamp: Date.now(),
    },
    {
      vehicleId: 'v2',
      position: { lat: 43.6045, lng: 3.8810 },
      bearing: 180,
      line: { id: 'r3', name: '10', type: 'bus', color: '#00A651' },
      headsign: 'Centre',
      timestamp: Date.now(),
    },
    {
      vehicleId: 'v3',
      position: { lat: 43.6100, lng: 3.8750 },
      bearing: 270,
      line: { id: 'r1', name: 'T1', type: 'tram', color: '#0055A4' },
      headsign: 'Odysseum',
      timestamp: Date.now(),
    },
  ]
}

async function makeRequest(
  app: Express,
  path: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const http = require('http')
    const server = app.listen(0, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Failed to get server address'))
        return
      }

      const url = `http://127.0.0.1:${address.port}${path}`

      http.get(url, (res: { statusCode: number; on: Function; setEncoding: Function }) => {
        res.setEncoding('utf8')
        let data = ''
        res.on('data', (chunk: string) => { data += chunk })
        res.on('end', () => {
          server.close()
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) })
          } catch {
            resolve({ status: res.statusCode, body: { raw: data } })
          }
        })
      }).on('error', (err: Error) => {
        server.close()
        reject(err)
      })
    })
  })
}

describe('GET /api/vehicles', () => {
  let app: Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp(createTestStaticData(), createTestConfig())
  })

  it('should return all vehicles', async () => {
    const vehicles = createTestVehicles()
    mockedFetchVehiclePositions.mockResolvedValue([])
    mockedEnrichVehicles.mockReturnValue(vehicles)

    const { status, body } = await makeRequest(app, '/api/vehicles')

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(3)
  })

  it('should pass both urban and suburban URLs to fetchVehiclePositions', async () => {
    mockedFetchVehiclePositions.mockResolvedValue([])
    mockedEnrichVehicles.mockReturnValue([])

    await makeRequest(app, '/api/vehicles')

    expect(mockedFetchVehiclePositions).toHaveBeenCalledWith([
      'https://example.com/urban.pb',
      'https://example.com/suburban.pb',
    ])
  })

  it('should filter vehicles by line name', async () => {
    const vehicles = createTestVehicles()
    mockedFetchVehiclePositions.mockResolvedValue([])
    mockedEnrichVehicles.mockReturnValue(vehicles)

    const { status, body } = await makeRequest(app, '/api/vehicles?line=T1')

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(2)
    expect((body.data as Vehicle[]).every((v) => v.line.name === 'T1')).toBe(true)
  })

  it('should return empty array when no vehicles match the line filter', async () => {
    const vehicles = createTestVehicles()
    mockedFetchVehiclePositions.mockResolvedValue([])
    mockedEnrichVehicles.mockReturnValue(vehicles)

    const { status, body } = await makeRequest(app, '/api/vehicles?line=T4')

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(0)
  })

  it('should return error when fetchVehiclePositions fails', async () => {
    mockedFetchVehiclePositions.mockRejectedValue(new Error('Network error'))

    const { status, body } = await makeRequest(app, '/api/vehicles')

    expect(status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Network error')
  })
})

describe('GET /api/lines', () => {
  let app: Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp(createTestStaticData(), createTestConfig())
  })

  it('should return all lines', async () => {
    const { status, body } = await makeRequest(app, '/api/lines')

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(4)
  })

  it('should sort trams before buses', async () => {
    const { body } = await makeRequest(app, '/api/lines')

    const lines = body.data as { type: string; name: string }[]
    const tramLines = lines.filter((l) => l.type === 'tram')
    const busLines = lines.filter((l) => l.type === 'bus')

    expect(tramLines).toHaveLength(2)
    expect(busLines).toHaveLength(2)

    const firstBusIndex = lines.findIndex((l) => l.type === 'bus')
    const lastTramIndex = lines.length - 1 - [...lines].reverse().findIndex((l) => l.type === 'tram')

    expect(lastTramIndex).toBeLessThan(firstBusIndex)
  })

  it('should sort alphabetically within each type', async () => {
    const { body } = await makeRequest(app, '/api/lines')

    const lines = body.data as { type: string; name: string }[]
    const tramNames = lines.filter((l) => l.type === 'tram').map((l) => l.name)
    const busNames = lines.filter((l) => l.type === 'bus').map((l) => l.name)

    expect(tramNames).toEqual(['T1', 'T2'])
    expect(busNames).toEqual(['10', '6'])
  })

  it('should map route type 0 to tram and type 3 to bus', async () => {
    const { body } = await makeRequest(app, '/api/lines')

    const lines = body.data as { id: string; type: string }[]
    const t1 = lines.find((l) => l.id === 'r1')
    const bus10 = lines.find((l) => l.id === 'r3')

    expect(t1?.type).toBe('tram')
    expect(bus10?.type).toBe('bus')
  })

  it('should include correct line properties', async () => {
    const { body } = await makeRequest(app, '/api/lines')

    const lines = body.data as { id: string; name: string; type: string; color: string }[]
    const t1 = lines.find((l) => l.id === 'r1')

    expect(t1).toEqual({
      id: 'r1',
      name: 'T1',
      type: 'tram',
      color: '#0055A4',
    })
  })
})

describe('GET /api/stops', () => {
  let app: Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp(createTestStaticData(), createTestConfig())
  })

  it('should return all stops when no bbox is provided', async () => {
    const { status, body } = await makeRequest(app, '/api/stops')

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(4)
  })

  it('should map GtfsStop to Stop format with position object', async () => {
    const { body } = await makeRequest(app, '/api/stops')

    const stops = body.data as { stopId: string; name: string; position: { lat: number; lng: number } }[]
    const comedie = stops.find((s) => s.stopId === 's1')

    expect(comedie).toEqual({
      stopId: 's1',
      name: 'Comedie',
      position: { lat: 43.6085, lng: 3.8795 },
    })
  })

  it('should filter stops within bbox', async () => {
    const bbox = '3.87,43.60,3.89,43.61'
    const { status, body } = await makeRequest(app, `/api/stops?bbox=${bbox}`)

    expect(status).toBe(200)
    expect(body.success).toBe(true)

    const stops = body.data as { stopId: string }[]
    const stopIds = stops.map((s) => s.stopId)

    expect(stopIds).toContain('s1')
    expect(stopIds).toContain('s2')
    expect(stopIds).not.toContain('s3')
    expect(stopIds).not.toContain('s4')
  })

  it('should return empty array when no stops are within bbox', async () => {
    const bbox = '0,0,1,1'
    const { status, body } = await makeRequest(app, `/api/stops?bbox=${bbox}`)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(0)
  })

  it('should return 400 for invalid bbox format', async () => {
    const { status, body } = await makeRequest(app, '/api/stops?bbox=invalid')

    expect(status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toContain('Invalid bbox format')
  })

  it('should return 400 for bbox with wrong number of values', async () => {
    const { status, body } = await makeRequest(app, '/api/stops?bbox=1,2,3')

    expect(status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toContain('Invalid bbox format')
  })
})
