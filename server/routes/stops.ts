import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import type { ApiResponse, Stop, GtfsStaticData, BBox, GtfsStop } from '../../src/types.js'

export const stopsRouter = Router()

const bboxSchema = z
  .string()
  .transform((val) => val.split(',').map(Number))
  .pipe(
    z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
  )
  .transform(
    ([minLng, minLat, maxLng, maxLat]): BBox => ({
      minLng,
      minLat,
      maxLng,
      maxLat,
    })
  )

function gtfsStopToStop(gtfsStop: GtfsStop): Stop {
  return {
    stopId: gtfsStop.stopId,
    name: gtfsStop.name,
    position: {
      lat: gtfsStop.lat,
      lng: gtfsStop.lng,
    },
  }
}

function isWithinBBox(stop: Stop, bbox: BBox): boolean {
  return (
    stop.position.lng >= bbox.minLng &&
    stop.position.lng <= bbox.maxLng &&
    stop.position.lat >= bbox.minLat &&
    stop.position.lat <= bbox.maxLat
  )
}

stopsRouter.get('/', (req: Request, res: Response<ApiResponse<Stop[]>>) => {
  try {
    const staticData = req.app.locals.staticData as GtfsStaticData

    let bbox: BBox | undefined

    if (typeof req.query.bbox === 'string') {
      const parsed = bboxSchema.safeParse(req.query.bbox)

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid bbox format. Expected: minLng,minLat,maxLng,maxLat',
        })
        return
      }

      bbox = parsed.data
    }

    const allStops = Array.from(staticData.stops.values()).map(gtfsStopToStop)

    const filtered = bbox ? allStops.filter((stop) => isWithinBBox(stop, bbox)) : allStops

    res.json({
      success: true,
      data: filtered,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch stops'

    res.status(500).json({
      success: false,
      error: message,
    })
  }
})
