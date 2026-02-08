import type { Vehicle } from '../types'

export interface VehicleMarkerElement {
  readonly element: HTMLDivElement
  readonly update: (vehicle: Vehicle) => void
}

function formatLabel(lineName: string): string {
  return lineName.length > 4 ? lineName.slice(0, 4) : lineName
}

export function createVehicleMarkerElement(vehicle: Vehicle): VehicleMarkerElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'vehicle-marker'

  const rotator = document.createElement('div')
  rotator.className = 'vehicle-marker__rotator'
  rotator.style.transform = `rotate(${vehicle.bearing}deg)`

  const nose = document.createElement('div')
  nose.className = 'vehicle-marker__nose'

  const circle = document.createElement('div')
  circle.className = 'vehicle-marker__circle'
  circle.style.backgroundColor = vehicle.line.color || '#3b82f6'

  const label = document.createElement('span')
  label.className = 'vehicle-marker__label'
  label.textContent = formatLabel(vehicle.line.name)

  circle.appendChild(label)
  rotator.appendChild(nose)
  rotator.appendChild(circle)
  wrapper.appendChild(rotator)

  function update(updated: Vehicle): void {
    rotator.style.transform = `rotate(${updated.bearing}deg)`
    circle.style.backgroundColor = updated.line.color || '#3b82f6'
    label.textContent = formatLabel(updated.line.name)
  }

  return { element: wrapper, update }
}
