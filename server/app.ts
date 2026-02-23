import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import type { GtfsStaticData, ApiResponse, RoutePath, StopTimeEntry } from '../src/types.js'
import type { Config } from './config.js'
import { vehiclesRouter } from './routes/vehicles.js'
import { linesRouter } from './routes/lines.js'
import { stopsRouter } from './routes/stops.js'
import { routePathsRouter } from './routes/route-paths.js'
import { stopArrivalsRouter } from './routes/stop-arrivals.js'
import { tripShapesRouter } from './routes/trip-shapes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATIC_DIR = path.join(__dirname, '..', 'dist')

export function createApp(
  staticData: GtfsStaticData,
  config: Config,
  routePaths?: readonly RoutePath[],
  stopTimes?: readonly StopTimeEntry[],
  tripShapeMap?: ReadonlyMap<string, string>,
  defaultShapeMap?: ReadonlyMap<string, string>
): Express {
  const app = express()

  app.use(cors())
  app.use(express.json())

  app.locals.staticData = staticData
  app.locals.config = config
  app.locals.routePaths = routePaths ?? []
  app.locals.stopTimes = stopTimes ?? []
  app.locals.tripShapeMap = tripShapeMap
  app.locals.defaultShapeMap = defaultShapeMap

  app.use('/api/vehicles', vehiclesRouter)
  app.use('/api/lines', linesRouter)
  app.use('/api/stops', stopsRouter)
  app.use('/api/stops', stopArrivalsRouter)
  app.use('/api/route-paths', routePathsRouter)
  app.use('/api/trip-shapes', tripShapesRouter)

  app.use(express.static(STATIC_DIR))
  app.get('*', (_req, res, next) => {
    if (_req.path.startsWith('/api')) {
      next()
      return
    }
    res.sendFile(path.join(STATIC_DIR, 'index.html'))
  })

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
