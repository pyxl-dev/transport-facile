import type { Vehicle } from '../types'

export function vehiclesToGeoJSON(
  vehicles: readonly Vehicle[]
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: vehicles.map((v) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [v.position.lng, v.position.lat],
      },
      properties: {
        vehicleId: v.vehicleId,
        color: v.line.color || '#3b82f6',
        bearing: v.bearing ?? 0,
        lineName: v.line.name,
        lineType: v.line.type,
        headsign: v.headsign || '',
      },
    })),
  }
}
