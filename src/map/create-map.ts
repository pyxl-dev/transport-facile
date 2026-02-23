import maplibregl from 'maplibre-gl'
import { MAP_CENTER, MAP_ZOOM } from '../config'

export function createMap(container: string | HTMLElement): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: 'https://tiles.openfreemap.org/styles/bright',
    center: [MAP_CENTER.lng, MAP_CENTER.lat],
    zoom: MAP_ZOOM,
    maxPitch: 0,
    attributionControl: {},
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')

  if (navigator.geolocation) {
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right'
    )
  }

  return map
}
