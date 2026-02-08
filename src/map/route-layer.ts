import maplibregl from 'maplibre-gl'
import type { RoutePath } from '../types'

const ROUTE_SOURCE = 'route-paths'
const ROUTE_CASING_LAYER = 'route-lines-casing'
const ROUTE_LINE_LAYER = 'route-lines'

function routePathsToGeoJSON(
  routePaths: readonly RoutePath[]
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: routePaths.map((rp) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: rp.coordinates.map((c) => [c[0], c[1]]),
      },
      properties: {
        routeId: rp.routeId,
        shortName: rp.shortName,
        color: rp.color,
        type: rp.type,
      },
    })),
  }
}

export function initRouteLayer(map: maplibregl.Map): void {
  map.addSource(ROUTE_SOURCE, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [],
    },
  })

  map.addLayer({
    id: ROUTE_CASING_LAYER,
    type: 'line',
    source: ROUTE_SOURCE,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': '#ffffff',
      'line-width': 5,
      'line-opacity': 0.6,
    },
  })

  map.addLayer({
    id: ROUTE_LINE_LAYER,
    type: 'line',
    source: ROUTE_SOURCE,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 3,
      'line-opacity': 0.8,
    },
  })
}

export function updateRouteLayer(
  map: maplibregl.Map,
  routePaths: readonly RoutePath[]
): void {
  const source = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined
  if (!source) {
    return
  }

  source.setData(routePathsToGeoJSON(routePaths))
}
