import type {
  RawVehiclePosition,
  GtfsStaticData,
  Vehicle,
} from '../../src/types.js'

function resolveRouteType(routeType: number): 'tram' | 'bus' {
  return routeType === 0 ? 'tram' : 'bus'
}

export function enrichVehicles(
  rawPositions: readonly RawVehiclePosition[],
  staticData: GtfsStaticData,
): readonly Vehicle[] {
  return rawPositions
    .map((raw) => {
      const trip = staticData.trips.get(raw.tripId)
      if (!trip) {
        return null
      }

      const route = staticData.routes.get(trip.routeId)
      if (!route) {
        return null
      }

      const vehicle: Vehicle = {
        vehicleId: raw.vehicleId,
        position: {
          lat: raw.lat,
          lng: raw.lng,
        },
        bearing: raw.bearing,
        line: {
          id: route.routeId,
          name: route.shortName,
          type: resolveRouteType(route.type),
          color: route.color,
        },
        headsign: trip.headsign,
        timestamp: raw.timestamp,
      }

      return vehicle
    })
    .filter((vehicle): vehicle is Vehicle => vehicle !== null)
}
