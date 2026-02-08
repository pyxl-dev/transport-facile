import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import type { GtfsStaticData, ApiResponse } from '../src/types.js'
import type { Config } from './config.js'
import { vehiclesRouter } from './routes/vehicles.js'
import { linesRouter } from './routes/lines.js'
import { stopsRouter } from './routes/stops.js'

export function createApp(staticData: GtfsStaticData, config: Config): Express {
  const app = express()

  app.use(cors())
  app.use(express.json())

  app.locals.staticData = staticData
  app.locals.config = config

  app.use('/api/vehicles', vehiclesRouter)
  app.use('/api/lines', linesRouter)
  app.use('/api/stops', stopsRouter)

  app.use(
    (err: Error, _req: Request, res: Response<ApiResponse<never>>, _next: NextFunction) => {
      const statusCode = res.statusCode !== 200 ? res.statusCode : 500

      res.status(statusCode).json({
        success: false,
        error: err.message || 'Internal server error',
      })
    }
  )

  return app
}
