// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createVehicleMarkerElement } from '../map/vehicle-marker'
import type { Vehicle } from '../types'

function createVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    vehicleId: 'v-001',
    position: { lat: 43.6108, lng: 3.8767 },
    bearing: 90,
    line: {
      id: 'T1',
      name: 'T1',
      type: 'tram',
      color: '#005CA9',
    },
    headsign: 'Mosson',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('createVehicleMarkerElement', () => {
  it('should create a wrapper with correct class', () => {
    const vehicle = createVehicle()
    const { element } = createVehicleMarkerElement(vehicle)

    expect(element.className).toBe('vehicle-marker')
  })

  it('should contain a rotator with bearing rotation', () => {
    const vehicle = createVehicle({ bearing: 180 })
    const { element } = createVehicleMarkerElement(vehicle)

    const rotator = element.querySelector('.vehicle-marker__rotator') as HTMLElement
    expect(rotator).not.toBeNull()
    expect(rotator.style.transform).toBe('rotate(180deg)')
  })

  it('should contain a nose element', () => {
    const vehicle = createVehicle()
    const { element } = createVehicleMarkerElement(vehicle)

    const nose = element.querySelector('.vehicle-marker__nose')
    expect(nose).not.toBeNull()
  })

  it('should contain a circle with the line color', () => {
    const vehicle = createVehicle({
      line: { id: 'T2', name: 'T2', type: 'tram', color: '#EE7F00' },
    })
    const { element } = createVehicleMarkerElement(vehicle)

    const circle = element.querySelector('.vehicle-marker__circle') as HTMLElement
    expect(circle).not.toBeNull()
    expect(circle.style.backgroundColor).toBe('rgb(238, 127, 0)')
  })

  it('should use default color when line color is empty', () => {
    const vehicle = createVehicle({
      line: { id: 'B1', name: 'B1', type: 'bus', color: '' },
    })
    const { element } = createVehicleMarkerElement(vehicle)

    const circle = element.querySelector('.vehicle-marker__circle') as HTMLElement
    expect(circle.style.backgroundColor).toBe('rgb(59, 130, 246)')
  })

  it('should display the line name as label', () => {
    const vehicle = createVehicle({
      line: { id: 'T3', name: 'T3', type: 'tram', color: '#82BE1E' },
    })
    const { element } = createVehicleMarkerElement(vehicle)

    const label = element.querySelector('.vehicle-marker__label')
    expect(label).not.toBeNull()
    expect(label!.textContent).toBe('T3')
  })

  it('should truncate long line names to 4 characters', () => {
    const vehicle = createVehicle({
      line: { id: 'B120', name: 'Ligne120', type: 'bus', color: '#FF0000' },
    })
    const { element } = createVehicleMarkerElement(vehicle)

    const label = element.querySelector('.vehicle-marker__label')
    expect(label!.textContent).toBe('Lign')
  })

  it('should have nose before circle in DOM order', () => {
    const vehicle = createVehicle()
    const { element } = createVehicleMarkerElement(vehicle)

    const rotator = element.querySelector('.vehicle-marker__rotator')!
    const children = Array.from(rotator.children)

    expect(children[0].className).toBe('vehicle-marker__nose')
    expect(children[1].className).toBe('vehicle-marker__circle')
  })

  describe('update', () => {
    it('should update bearing rotation', () => {
      const vehicle = createVehicle({ bearing: 0 })
      const { element, update } = createVehicleMarkerElement(vehicle)

      const rotator = element.querySelector('.vehicle-marker__rotator') as HTMLElement
      expect(rotator.style.transform).toBe('rotate(0deg)')

      update(createVehicle({ bearing: 270 }))
      expect(rotator.style.transform).toBe('rotate(270deg)')
    })

    it('should update circle color', () => {
      const vehicle = createVehicle()
      const { element, update } = createVehicleMarkerElement(vehicle)

      const circle = element.querySelector('.vehicle-marker__circle') as HTMLElement

      update(createVehicle({
        line: { id: 'T4', name: 'T4', type: 'tram', color: '#C3007A' },
      }))
      expect(circle.style.backgroundColor).toBe('rgb(195, 0, 122)')
    })

    it('should update label text', () => {
      const vehicle = createVehicle()
      const { element, update } = createVehicleMarkerElement(vehicle)

      const label = element.querySelector('.vehicle-marker__label')!

      update(createVehicle({
        line: { id: 'B6', name: '6', type: 'bus', color: '#FF0000' },
      }))
      expect(label.textContent).toBe('6')
    })
  })
})
