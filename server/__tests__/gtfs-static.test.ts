import { parseRoutes, parseTrips, parseStops, parseStopTimes, parseShapes, loadGtfsStaticData } from '../services/gtfs-static.js'
import type { Config } from '../config.js'

describe('gtfs-static', () => {
  describe('parseRoutes', () => {
    it('should parse routes CSV into a Map of GtfsRoute', () => {
      const csv = [
        'route_id,route_short_name,route_long_name,route_type,route_color,route_text_color',
        'R1,1,Mosson - Odysseum,0,0074CE,FFFFFF',
        'R2,2,Saint-Jean-de-Vedas - Jacou,0,EE7B0B,000000',
      ].join('\n')

      const routes = parseRoutes(csv)

      expect(routes.size).toBe(2)

      const route1 = routes.get('R1')
      expect(route1).toEqual({
        routeId: 'R1',
        shortName: '1',
        longName: 'Mosson - Odysseum',
        type: 0,
        color: '#0074CE',
        textColor: '#FFFFFF',
      })

      const route2 = routes.get('R2')
      expect(route2).toEqual({
        routeId: 'R2',
        shortName: '2',
        longName: 'Saint-Jean-de-Vedas - Jacou',
        type: 0,
        color: '#EE7B0B',
        textColor: '#000000',
      })
    })

    it('should handle bus route_type correctly', () => {
      const csv = [
        'route_id,route_short_name,route_long_name,route_type,route_color,route_text_color',
        'B10,10,Line 10,3,FF0000,FFFFFF',
      ].join('\n')

      const routes = parseRoutes(csv)
      const route = routes.get('B10')

      expect(route).toBeDefined()
      expect(route!.type).toBe(3)
    })

    it('should default colors when empty', () => {
      const csv = [
        'route_id,route_short_name,route_long_name,route_type,route_color,route_text_color',
        'R3,3,Line 3,0,,',
      ].join('\n')

      const routes = parseRoutes(csv)
      const route = routes.get('R3')

      expect(route!.color).toBe('#000000')
      expect(route!.textColor).toBe('#FFFFFF')
    })

    it('should return an empty Map for empty CSV', () => {
      const csv = 'route_id,route_short_name,route_long_name,route_type,route_color,route_text_color\n'

      const routes = parseRoutes(csv)
      expect(routes.size).toBe(0)
    })
  })

  describe('parseTrips', () => {
    it('should parse trips CSV into a Map of GtfsTrip', () => {
      const csv = [
        'trip_id,route_id,trip_headsign,direction_id',
        'T100,R1,Odysseum,0',
        'T101,R1,Mosson,1',
        'T200,R2,Jacou,0',
      ].join('\n')

      const trips = parseTrips(csv)

      expect(trips.size).toBe(3)

      expect(trips.get('T100')).toEqual({
        tripId: 'T100',
        routeId: 'R1',
        headsign: 'Odysseum',
        directionId: '0',
      })

      expect(trips.get('T101')).toEqual({
        tripId: 'T101',
        routeId: 'R1',
        headsign: 'Mosson',
        directionId: '1',
      })
    })

    it('should return an empty Map for empty CSV', () => {
      const csv = 'trip_id,route_id,trip_headsign,direction_id\n'

      const trips = parseTrips(csv)
      expect(trips.size).toBe(0)
    })
  })

  describe('parseStops', () => {
    it('should parse stops CSV into a Map of GtfsStop', () => {
      const csv = [
        'stop_id,stop_name,stop_lat,stop_lon',
        'S1,Comedie,43.6085,3.8805',
        'S2,Gare Saint-Roch,43.6045,3.8810',
      ].join('\n')

      const stops = parseStops(csv)

      expect(stops.size).toBe(2)

      expect(stops.get('S1')).toEqual({
        stopId: 'S1',
        name: 'Comedie',
        lat: 43.6085,
        lng: 3.8805,
      })

      expect(stops.get('S2')).toEqual({
        stopId: 'S2',
        name: 'Gare Saint-Roch',
        lat: 43.6045,
        lng: 3.881,
      })
    })

    it('should return an empty Map for empty CSV', () => {
      const csv = 'stop_id,stop_name,stop_lat,stop_lon\n'

      const stops = parseStops(csv)
      expect(stops.size).toBe(0)
    })
  })

  describe('parseStopTimes', () => {
    it('should parse stop_times CSV into StopTimeEntry array', () => {
      const csv = [
        'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
        'T100,08:00:00,08:01:00,S1,1',
        'T100,08:05:00,08:06:00,S2,2',
        'T100,08:10:00,08:11:00,S3,3',
      ].join('\n')

      const stopTimes = parseStopTimes(csv)

      expect(stopTimes).toHaveLength(3)
      expect(stopTimes[0]).toEqual({ tripId: 'T100', stopId: 'S1', sequence: 1 })
      expect(stopTimes[1]).toEqual({ tripId: 'T100', stopId: 'S2', sequence: 2 })
      expect(stopTimes[2]).toEqual({ tripId: 'T100', stopId: 'S3', sequence: 3 })
    })

    it('should return empty array for empty CSV', () => {
      const csv = 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n'

      const stopTimes = parseStopTimes(csv)
      expect(stopTimes).toHaveLength(0)
    })
  })

  describe('parseShapes', () => {
    it('should parse shapes CSV into Map grouped by shapeId', () => {
      const csv = [
        'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
        'SH1,43.60,3.87,1',
        'SH1,43.61,3.88,2',
        'SH2,43.62,3.89,1',
      ].join('\n')

      const shapes = parseShapes(csv)

      expect(shapes.size).toBe(2)
      expect(shapes.get('SH1')).toHaveLength(2)
      expect(shapes.get('SH2')).toHaveLength(1)
    })

    it('should sort shape points by sequence', () => {
      const csv = [
        'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
        'SH1,43.62,3.89,3',
        'SH1,43.60,3.87,1',
        'SH1,43.61,3.88,2',
      ].join('\n')

      const shapes = parseShapes(csv)
      const points = shapes.get('SH1')!

      expect(points[0].sequence).toBe(1)
      expect(points[1].sequence).toBe(2)
      expect(points[2].sequence).toBe(3)
    })

    it('should return empty Map for empty CSV', () => {
      const csv = 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n'

      const shapes = parseShapes(csv)
      expect(shapes.size).toBe(0)
    })
  })

  describe('parseTrips with shapeId', () => {
    it('should include shapeId when present', () => {
      const csv = [
        'trip_id,route_id,trip_headsign,direction_id,shape_id',
        'T100,R1,Odysseum,0,SH1',
      ].join('\n')

      const trips = parseTrips(csv)
      expect(trips.get('T100')?.shapeId).toBe('SH1')
    })

    it('should omit shapeId when not present', () => {
      const csv = [
        'trip_id,route_id,trip_headsign,direction_id',
        'T100,R1,Odysseum,0',
      ].join('\n')

      const trips = parseTrips(csv)
      expect(trips.get('T100')?.shapeId).toBeUndefined()
    })
  })

  describe('loadGtfsStaticData', () => {
    it('should download, extract, and merge urban and suburban data', async () => {
      const urbanRoutesCsv = [
        'route_id,route_short_name,route_long_name,route_type,route_color,route_text_color',
        'R1,1,Urban Line 1,0,0074CE,FFFFFF',
      ].join('\n')
      const urbanTripsCsv = [
        'trip_id,route_id,trip_headsign,direction_id',
        'T1,R1,Terminus A,0',
      ].join('\n')
      const urbanStopsCsv = [
        'stop_id,stop_name,stop_lat,stop_lon',
        'S1,Stop Urban,43.60,3.88',
      ].join('\n')

      const suburbanRoutesCsv = [
        'route_id,route_short_name,route_long_name,route_type,route_color,route_text_color',
        'R2,2,Suburban Line 2,3,FF0000,000000',
      ].join('\n')
      const suburbanTripsCsv = [
        'trip_id,route_id,trip_headsign,direction_id',
        'T2,R2,Terminus B,1',
      ].join('\n')
      const suburbanStopsCsv = [
        'stop_id,stop_name,stop_lat,stop_lon',
        'S2,Stop Suburban,43.61,3.89',
      ].join('\n')

      const AdmZipMock = await import('adm-zip')
      const createMockZipBuffer = (files: Record<string, string>): Buffer => {
        const zip = new AdmZipMock.default()
        for (const [name, content] of Object.entries(files)) {
          zip.addFile(name, Buffer.from(content, 'utf-8'))
        }
        return zip.toBuffer()
      }

      const urbanBuffer = createMockZipBuffer({
        'routes.txt': urbanRoutesCsv,
        'trips.txt': urbanTripsCsv,
        'stops.txt': urbanStopsCsv,
      })

      const suburbanBuffer = createMockZipBuffer({
        'routes.txt': suburbanRoutesCsv,
        'trips.txt': suburbanTripsCsv,
        'stops.txt': suburbanStopsCsv,
      })

      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn((url: string | URL | Request) => {
        const urlStr = String(url)
        const buffer = urlStr.includes('Urbain') ? urbanBuffer : suburbanBuffer
        return Promise.resolve(
          new Response(new Uint8Array(buffer), { status: 200 })
        )
      }) as typeof globalThis.fetch

      try {
        const config: Config = {
          PORT: 3000,
          GTFS_URBAN_RT_URL: 'https://example.com/Urbain/VehiclePosition.pb',
          GTFS_SUBURBAN_RT_URL: 'https://example.com/Suburbain/VehiclePosition.pb',
          GTFS_URBAN_STATIC_URL: 'https://example.com/Urbain/GTFS.zip',
          GTFS_SUBURBAN_STATIC_URL: 'https://example.com/Suburbain/GTFS.zip',
          GTFS_REFRESH_INTERVAL: 30000,
        }

        const result = await loadGtfsStaticData(config)

        expect(result.staticData.routes.size).toBe(2)
        expect(result.staticData.routes.get('R1')?.shortName).toBe('1')
        expect(result.staticData.routes.get('R2')?.shortName).toBe('2')

        expect(result.staticData.trips.size).toBe(2)
        expect(result.staticData.trips.get('T1')?.headsign).toBe('Terminus A')
        expect(result.staticData.trips.get('T2')?.headsign).toBe('Terminus B')

        expect(result.staticData.stops.size).toBe(2)
        expect(result.staticData.stops.get('S1')?.name).toBe('Stop Urban')
        expect(result.staticData.stops.get('S2')?.name).toBe('Stop Suburban')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('should let suburban data overwrite urban on conflict', async () => {
      const urbanRoutesCsv = [
        'route_id,route_short_name,route_long_name,route_type,route_color,route_text_color',
        'R1,1,Urban Version,0,0074CE,FFFFFF',
      ].join('\n')
      const urbanTripsCsv = 'trip_id,route_id,trip_headsign,direction_id\n'
      const urbanStopsCsv = 'stop_id,stop_name,stop_lat,stop_lon\n'

      const suburbanRoutesCsv = [
        'route_id,route_short_name,route_long_name,route_type,route_color,route_text_color',
        'R1,1,Suburban Version,3,FF0000,000000',
      ].join('\n')
      const suburbanTripsCsv = 'trip_id,route_id,trip_headsign,direction_id\n'
      const suburbanStopsCsv = 'stop_id,stop_name,stop_lat,stop_lon\n'

      const AdmZipMock = await import('adm-zip')
      const createMockZipBuffer = (files: Record<string, string>): Buffer => {
        const zip = new AdmZipMock.default()
        for (const [name, content] of Object.entries(files)) {
          zip.addFile(name, Buffer.from(content, 'utf-8'))
        }
        return zip.toBuffer()
      }

      const urbanBuffer = createMockZipBuffer({
        'routes.txt': urbanRoutesCsv,
        'trips.txt': urbanTripsCsv,
        'stops.txt': urbanStopsCsv,
      })

      const suburbanBuffer = createMockZipBuffer({
        'routes.txt': suburbanRoutesCsv,
        'trips.txt': suburbanTripsCsv,
        'stops.txt': suburbanStopsCsv,
      })

      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn((url: string | URL | Request) => {
        const urlStr = String(url)
        const buffer = urlStr.includes('Urbain') ? urbanBuffer : suburbanBuffer
        return Promise.resolve(
          new Response(new Uint8Array(buffer), { status: 200 })
        )
      }) as typeof globalThis.fetch

      try {
        const config: Config = {
          PORT: 3000,
          GTFS_URBAN_RT_URL: 'https://example.com/Urbain/VehiclePosition.pb',
          GTFS_SUBURBAN_RT_URL: 'https://example.com/Suburbain/VehiclePosition.pb',
          GTFS_URBAN_STATIC_URL: 'https://example.com/Urbain/GTFS.zip',
          GTFS_SUBURBAN_STATIC_URL: 'https://example.com/Suburbain/GTFS.zip',
          GTFS_REFRESH_INTERVAL: 30000,
        }

        const result = await loadGtfsStaticData(config)

        expect(result.staticData.routes.size).toBe(1)
        expect(result.staticData.routes.get('R1')?.longName).toBe('Suburban Version')
        expect(result.staticData.routes.get('R1')?.type).toBe(3)
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
