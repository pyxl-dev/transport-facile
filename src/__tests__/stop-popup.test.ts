// @vitest-environment jsdom
import { createStopPopupContent, renderArrivals } from '../ui/stop-popup'
import type { StopArrival } from '../types'

describe('createStopPopupContent', () => {
  it('should include stop name', () => {
    const html = createStopPopupContent('Comédie')

    expect(html).toContain('Comédie')
  })

  it('should include loading message', () => {
    const html = createStopPopupContent('Comédie')

    expect(html).toContain('Chargement...')
  })

  it('should include favorite star button', () => {
    const html = createStopPopupContent('Comédie')

    expect(html).toContain('data-stop-favorite-toggle="true"')
    expect(html).toContain('role="button"')
  })

  it('should show outline star when not favorite', () => {
    const html = createStopPopupContent('Comédie', false)

    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('Ajouter aux favoris')
    expect(html).not.toContain('favorite-star--active')
  })

  it('should show filled star when favorite', () => {
    const html = createStopPopupContent('Comédie', true)

    expect(html).toContain('favorite-star--active')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('Retirer des favoris')
    expect(html).toContain('fill="currentColor"')
  })

  it('should have header with flex layout container', () => {
    const html = createStopPopupContent('Test')

    expect(html).toContain('stop-popup__header')
    expect(html).toContain('stop-popup__favorite')
  })
})

describe('renderArrivals', () => {
  it('should show empty message when no arrivals', () => {
    const html = renderArrivals([])

    expect(html).toContain('Aucun passage prevu')
  })

  it('should render arrival groups', () => {
    const arrivals: StopArrival[] = [
      {
        lineName: 'T1',
        lineColor: '#005CA9',
        lineType: 'tram',
        direction: 'A',
        headsign: 'Mosson',
        arrivalMinutes: 3,
        isRealTime: true,
      },
    ]

    const html = renderArrivals(arrivals)

    expect(html).toContain('Mosson')
    expect(html).toContain('#005CA9')
    expect(html).toContain('3')
  })
})
