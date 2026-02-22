import { Router, type Request, type Response } from 'express'
import type { ApiResponse, GtfsStaticData, StopArrival, StopTimeEntry } from '../../src/types.js'
import type { Config } from '../config.js'
import { fetchTripUpdates } from '../services/gtfs-trip-update.js'
import { buildStopArrivals } from '../services/stop-arrivals.js'

export const stopArrivalsRouter = Router()

stopArrivalsRouter.get(
  '/:stopId/arrivals',
  async (req: Request<{ stopId: string }>, res: Response<ApiResponse<readonly StopArrival[]>>) => {
    try {
      const stopId = req.params.stopId
      const staticData = req.app.locals.staticData as GtfsStaticData
      const config = req.app.locals.config as Config
      const stopTimes = req.app.locals.stopTimes as readonly StopTimeEntry[]

      const stop = staticData.stops.get(stopId)
      if (!stop) {
        res.status(404).json({
          success: false,
          error: `Stop ${stopId} not found`,
        })
        return
      }

      const tripUpdates = await fetchTripUpdates([
        config.GTFS_URBAN_TU_URL,
        config.GTFS_SUBURBAN_TU_URL,
      ])

      const arrivals = buildStopArrivals(
        stopId,
        staticData,
        stopTimes,
        tripUpdates
      )

      res.json({
        success: true,
        data: arrivals,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch arrivals'
      res.status(500).json({
        success: false,
        error: message,
      })
    }
  }
)
