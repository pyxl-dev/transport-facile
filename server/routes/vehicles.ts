import { Router, type Request, type Response } from 'express'
import type { ApiResponse, Vehicle, GtfsStaticData } from '../../src/types.js'
import type { Config } from '../config.js'
import { fetchVehiclePositions } from '../services/gtfs-realtime.js'
import { enrichVehicles } from '../services/vehicle-enricher.js'

export const vehiclesRouter = Router()

vehiclesRouter.get('/', async (req: Request, res: Response<ApiResponse<Vehicle[]>>) => {
  try {
    const staticData = req.app.locals.staticData as GtfsStaticData
    const config = req.app.locals.config as Config

    const lineFilter = typeof req.query.line === 'string' ? req.query.line : undefined

    const urls = [config.GTFS_URBAN_RT_URL, config.GTFS_SUBURBAN_RT_URL]
    const rawPositions = await fetchVehiclePositions(urls)
    const vehicles = enrichVehicles(rawPositions, staticData)

    const filtered = lineFilter
      ? vehicles.filter((v) => v.line.name === lineFilter)
      : vehicles

    res.json({
      success: true,
      data: [...filtered],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch vehicle positions'

    res.status(500).json({
      success: false,
      error: message,
    })
  }
})
