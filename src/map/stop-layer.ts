import maplibregl from 'maplibre-gl'
import type { Stop } from '../types'
import { STOP_VISIBLE_ZOOM } from '../config'

const STOP_SOURCE = 'stops'
const STOP_CLUSTERS_LAYER = 'stop-clusters'
const STOP_CLUSTER_COUNT_LAYER = 'stop-cluster-count'
const STOP_UNCLUSTERED_LAYER = 'stop-unclustered'

function createEmptyFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [],
  }
}

export function stopsToGeoJSON(
  stops: readonly Stop[]
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stops.map((s) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [s.position.lng, s.position.lat],
      },
      properties: {
        stopId: s.stopId,
        name: s.name,
      },
    })),
  }
}

export function initStopLayer(map: maplibregl.Map): void {
  map.addSource(STOP_SOURCE, {
    type: 'geojson',
    data: createEmptyFeatureCollection(),
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50,
  })

  map.addLayer({
    id: STOP_CLUSTERS_LAYER,
    type: 'circle',
    source: STOP_SOURCE,
    filter: ['has', 'point_count'],
    minzoom: STOP_VISIBLE_ZOOM,
    paint: {
      'circle-color': '#94a3b8',
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        15,
        10,
        20,
        50,
        25,
      ],
    },
  })

  map.addLayer({
    id: STOP_CLUSTER_COUNT_LAYER,
    type: 'symbol',
    source: STOP_SOURCE,
    filter: ['has', 'point_count'],
    minzoom: STOP_VISIBLE_ZOOM,
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-size': 12,
    },
    paint: {
      'text-color': '#ffffff',
    },
  })

  map.addLayer({
    id: STOP_UNCLUSTERED_LAYER,
    type: 'circle',
    source: STOP_SOURCE,
    filter: ['!', ['has', 'point_count']],
    minzoom: STOP_VISIBLE_ZOOM,
    paint: {
      'circle-radius': 5,
      'circle-color': '#64748b',
      'circle-stroke-width': 1,
      'circle-stroke-color': '#ffffff',
    },
  })

  map.on('click', STOP_UNCLUSTERED_LAYER, (e) => {
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

    new maplibregl.Popup()
      .setLngLat(coordinates)
      .setHTML(`<strong>${String(properties.name)}</strong>`)
      .addTo(map)
  })

  map.on('click', STOP_CLUSTERS_LAYER, (e) => {
    const features = map.queryRenderedFeatures(e.point, {
      layers: [STOP_CLUSTERS_LAYER],
    })

    if (features.length === 0) {
      return
    }

    const clusterId = features[0].properties?.cluster_id as number | undefined
    if (clusterId === undefined) {
      return
    }

    const source = map.getSource(STOP_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (!source) {
      return
    }

    source.getClusterExpansionZoom(clusterId).then((zoom) => {
      const coordinates = (features[0].geometry as GeoJSON.Point).coordinates as [
        number,
        number,
      ]

      map.easeTo({
        center: coordinates,
        zoom,
      })
    })
  })

  map.on('mouseenter', STOP_CLUSTERS_LAYER, () => {
    const canvas = map.getCanvas()
    canvas.style.cursor = 'pointer'
  })

  map.on('mouseleave', STOP_CLUSTERS_LAYER, () => {
    const canvas = map.getCanvas()
    canvas.style.cursor = ''
  })

  map.on('mouseenter', STOP_UNCLUSTERED_LAYER, () => {
    const canvas = map.getCanvas()
    canvas.style.cursor = 'pointer'
  })

  map.on('mouseleave', STOP_UNCLUSTERED_LAYER, () => {
    const canvas = map.getCanvas()
    canvas.style.cursor = ''
  })
}

export function updateStopLayer(
  map: maplibregl.Map,
  stops: readonly Stop[]
): void {
  const source = map.getSource(STOP_SOURCE) as maplibregl.GeoJSONSource | undefined
  if (!source) {
    return
  }

  const geojson = stopsToGeoJSON(stops)
  source.setData(geojson)
}
