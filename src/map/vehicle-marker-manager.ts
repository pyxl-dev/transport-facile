import maplibregl from 'maplibre-gl'
import type { Vehicle } from '../types'
import { createVehicleMarkerElement, type VehicleMarkerElement } from './vehicle-marker'
import { createVehiclePopupContent } from '../ui/vehicle-popup'

interface MarkerEntry {
  readonly marker: maplibregl.Marker
  readonly markerElement: VehicleMarkerElement
  vehicle: Vehicle
}

let markers = new Map<string, MarkerEntry>()
let activePopup: maplibregl.Popup | null = null

export function initVehicleMarkers(_map: maplibregl.Map): void {
  markers = new Map()
}

export function updateVehicleMarkers(
  map: maplibregl.Map,
  vehicles: readonly Vehicle[]
): void {
  const activeIds = new Set(vehicles.map((v) => v.vehicleId))

  const removedIds: string[] = []
  for (const [id, entry] of markers) {
    if (!activeIds.has(id)) {
      entry.marker.remove()
      removedIds.push(id)
    }
  }

  if (removedIds.length > 0) {
    const next = new Map(markers)
    for (const id of removedIds) {
      next.delete(id)
    }
    markers = next
  }

  const additions = new Map(markers)
  let changed = false

  for (const vehicle of vehicles) {
    const existing = markers.get(vehicle.vehicleId)

    if (existing) {
      existing.markerElement.update(vehicle)
      existing.marker.setLngLat([vehicle.position.lng, vehicle.position.lat])
      existing.vehicle = vehicle
    } else {
      const markerElement = createVehicleMarkerElement(vehicle)
      const marker = new maplibregl.Marker({
        element: markerElement.element,
        anchor: 'center',
      })
        .setLngLat([vehicle.position.lng, vehicle.position.lat])
        .addTo(map)

      const entry: MarkerEntry = { marker, markerElement, vehicle }
      attachPopupHandler(map, entry)
      additions.set(vehicle.vehicleId, entry)
      changed = true
    }
  }

  if (changed) {
    markers = additions
  }
}

export function setupVehicleMarkerPopups(_map: maplibregl.Map): void {
  // Popups are now attached per-marker in attachPopupHandler
}

function attachPopupHandler(map: maplibregl.Map, entry: MarkerEntry): void {
  entry.markerElement.element.addEventListener('click', (e) => {
    e.stopPropagation()

    const { vehicle } = entry

    const popupContent = createVehiclePopupContent({
      lineName: vehicle.line.name,
      lineType: vehicle.line.type,
      color: vehicle.line.color,
      headsign: vehicle.headsign,
      vehicleId: vehicle.vehicleId,
    })

    if (activePopup) {
      activePopup.remove()
    }

    activePopup = new maplibregl.Popup({ offset: 20 })
      .setLngLat([vehicle.position.lng, vehicle.position.lat])
      .setHTML(popupContent)
      .addTo(map)

    activePopup.on('close', () => {
      activePopup = null
    })
  })
}
