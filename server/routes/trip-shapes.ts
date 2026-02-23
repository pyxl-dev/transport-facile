import { Router, type Request, type Response } from 'express'
import type { ApiResponse, TripShapesData } from '../../src/types.js'

export const tripShapesRouter = Router()

tripShapesRouter.get('/', (_req: Request, res: Response<ApiResponse<TripShapesData>>) => {
  try {
    const tripShapeMap = _req.app.locals.tripShapeMap as ReadonlyMap<string, string> | undefined
    const defaultShapeMap = _req.app.locals.defaultShapeMap as ReadonlyMap<string, string> | undefined

    const tripShapes: Record<string, string> = {}
    if (tripShapeMap) {
      for (const [tripId, shapeId] of tripShapeMap) {
        tripShapes[tripId] = shapeId
      }
    }

    const defaultShapes: Record<string, string> = {}
    if (defaultShapeMap) {
      for (const [routeId, shapeId] of defaultShapeMap) {
        defaultShapes[routeId] = shapeId
      }
    }

    res.json({
      success: true,
      data: { tripShapes, defaultShapes },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get trip shapes'

    res.status(500).json({
      success: false,
      error: message,
    })
  }
})
