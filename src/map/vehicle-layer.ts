import maplibregl from 'maplibre-gl'
import type { Vehicle } from '../types'
import { createVehiclePopupContent } from '../ui/vehicle-popup'

const VEHICLE_SOURCE = 'vehicles'
const VEHICLE_CIRCLES_LAYER = 'vehicle-circles'

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

export function initVehicleLayer(map: maplibregl.Map): void {
  map.addSource(VEHICLE_SOURCE, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [],
    },
  })

  map.addLayer({
    id: VEHICLE_CIRCLES_LAYER,
    type: 'circle',
    source: VEHICLE_SOURCE,
    paint: {
      'circle-radius': 12,
      'circle-color': ['get', 'color'],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  })

}

export function updateVehicleLayer(
  map: maplibregl.Map,
  vehicles: readonly Vehicle[]
): void {
  const source = map.getSource(VEHICLE_SOURCE) as maplibregl.GeoJSONSource | undefined
  if (!source) {
    return
  }

  const geojson = vehiclesToGeoJSON(vehicles)
  source.setData(geojson)
}

export function setupVehiclePopup(map: maplibregl.Map): void {
  map.on('click', VEHICLE_CIRCLES_LAYER, (e) => {
    const features = e.features
    if (!features || features.length === 0) {
      return
    }

    const feature = features[0]
    const coordinates = (feature.geometry as GeoJSON.Point).coordinates.slice() as [
      number,
      number,
    ]
    const properties = feature.properties

    if (!properties) {
      return
    }

    const popupContent = createVehiclePopupContent({
      lineName: String(properties.lineName),
      lineType: String(properties.lineType),
      color: String(properties.color),
      headsign: String(properties.headsign),
      vehicleId: String(properties.vehicleId),
    })

    new maplibregl.Popup()
      .setLngLat(coordinates)
      .setHTML(popupContent)
      .addTo(map)
  })

  map.on('mouseenter', VEHICLE_CIRCLES_LAYER, () => {
    const canvas = map.getCanvas()
    canvas.style.cursor = 'pointer'
  })

  map.on('mouseleave', VEHICLE_CIRCLES_LAYER, () => {
    const canvas = map.getCanvas()
    canvas.style.cursor = ''
  })
}
