export interface Position {
  readonly lat: number
  readonly lng: number
}

export interface LineInfo {
  readonly id: string
  readonly name: string
  readonly type: 'tram' | 'bus'
  readonly color: string
}

export interface Vehicle {
  readonly vehicleId: string
  readonly position: Position
  readonly bearing: number
  readonly line: LineInfo
  readonly headsign: string
  readonly timestamp: number
}

export interface Stop {
  readonly stopId: string
  readonly name: string
  readonly position: Position
}

export interface GtfsRoute {
  readonly routeId: string
  readonly shortName: string
  readonly longName: string
  readonly type: number
  readonly color: string
  readonly textColor: string
}

export interface GtfsTrip {
  readonly tripId: string
  readonly routeId: string
  readonly headsign: string
  readonly directionId: string
  readonly shapeId?: string
}

export interface GtfsStop {
  readonly stopId: string
  readonly name: string
  readonly lat: number
  readonly lng: number
}

export interface GtfsStaticData {
  readonly routes: ReadonlyMap<string, GtfsRoute>
  readonly trips: ReadonlyMap<string, GtfsTrip>
  readonly stops: ReadonlyMap<string, GtfsStop>
}

export interface RawVehiclePosition {
  readonly vehicleId: string
  readonly tripId: string
  readonly lat: number
  readonly lng: number
  readonly bearing: number
  readonly timestamp: number
}

export interface ApiResponse<T> {
  readonly success: boolean
  readonly data?: T
  readonly error?: string
}

export interface AppState {
  readonly vehicles: readonly Vehicle[]
  readonly lines: readonly LineInfo[]
  readonly stops: readonly Stop[]
  readonly routePaths: readonly RoutePath[]
  readonly selectedLines: ReadonlySet<string>
  readonly isLoading: boolean
  readonly lastUpdated: number | null
}

export interface BBox {
  readonly minLng: number
  readonly minLat: number
  readonly maxLng: number
  readonly maxLat: number
}

export interface RoutePath {
  readonly routeId: string
  readonly shortName: string
  readonly color: string
  readonly type: 'tram' | 'bus'
  readonly coordinates: readonly (readonly [number, number])[]
}

export interface ShapePoint {
  readonly shapeId: string
  readonly lat: number
  readonly lng: number
  readonly sequence: number
}

export interface StopTimeEntry {
  readonly tripId: string
  readonly stopId: string
  readonly sequence: number
}
