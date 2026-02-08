import { describe, it, expect, vi } from 'vitest'
import type { RoutePath } from '../types'

vi.mock('maplibre-gl', () => {
  let sourceData: any = null

  return {
    default: {
      Map: vi.fn(),
    },
    _getSourceData: () => sourceData,
    _createMockMap: () => {
      const sources: Record<string, any> = {}
      const layers: Record<string, any> = {}

      return {
        addSource: vi.fn((id: string, config: any) => {
          sources[id] = {
            ...config,
            setData: vi.fn((data: any) => {
              sources[id].data = data
              sourceData = data
            }),
            data: config.data,
          }
        }),
        addLayer: vi.fn((layer: any) => {
          layers[layer.id] = layer
        }),
        getSource: vi.fn((id: string) => sources[id]),
        _sources: sources,
        _layers: layers,
      }
    },
  }
})

describe('route-layer', () => {
  it('should initialize source and layers', async () => {
    const { _createMockMap } = await import('maplibre-gl') as any
    const map = _createMockMap()

    const { initRouteLayer } = await import('../map/route-layer')
    initRouteLayer(map)

    expect(map.addSource).toHaveBeenCalledWith('route-paths', expect.objectContaining({
      type: 'geojson',
    }))

    expect(map.addLayer).toHaveBeenCalledTimes(2)
    expect(map._layers['route-lines-casing']).toBeDefined()
    expect(map._layers['route-lines']).toBeDefined()
  })

  it('should update source data with route paths', async () => {
    const { _createMockMap } = await import('maplibre-gl') as any
    const map = _createMockMap()

    const { initRouteLayer, updateRouteLayer } = await import('../map/route-layer')
    initRouteLayer(map)

    const routePaths: RoutePath[] = [
      {
        routeId: 'R1',
        shortName: 'T1',
        color: '#005CA9',
        type: 'tram',
        coordinates: [[3.87, 43.60], [3.88, 43.61], [3.89, 43.62]],
      },
    ]

    updateRouteLayer(map, routePaths)

    const source = map.getSource('route-paths')
    expect(source.setData).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FeatureCollection',
        features: expect.arrayContaining([
          expect.objectContaining({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[3.87, 43.60], [3.88, 43.61], [3.89, 43.62]],
            },
            properties: expect.objectContaining({
              routeId: 'R1',
              shortName: 'T1',
              color: '#005CA9',
            }),
          }),
        ]),
      })
    )
  })

  it('should handle empty route paths', async () => {
    const { _createMockMap } = await import('maplibre-gl') as any
    const map = _createMockMap()

    const { initRouteLayer, updateRouteLayer } = await import('../map/route-layer')
    initRouteLayer(map)

    updateRouteLayer(map, [])

    const source = map.getSource('route-paths')
    expect(source.setData).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FeatureCollection',
        features: [],
      })
    )
  })

  it('should not crash if source is not initialized', async () => {
    const { _createMockMap } = await import('maplibre-gl') as any
    const map = _createMockMap()

    const { updateRouteLayer } = await import('../map/route-layer')

    expect(() => updateRouteLayer(map, [])).not.toThrow()
  })
})
