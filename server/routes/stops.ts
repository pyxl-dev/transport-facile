import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import type { ApiResponse, Stop, GtfsStaticData, BBox, GtfsStop, GtfsTrip, StopTimeEntry } from '../../src/types.js'

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

function buildStopToRoutes(
  stopTimes: readonly StopTimeEntry[],
  trips: ReadonlyMap<string, GtfsTrip>,
): ReadonlyMap<string, readonly string[]> {
  const stopRoutes = new Map<string, Set<string>>()
  for (const st of stopTimes) {
    const trip = trips.get(st.tripId)
    if (!trip) continue
    const existing = stopRoutes.get(st.stopId)
    if (existing) {
      existing.add(trip.routeId)
    } else {
      stopRoutes.set(st.stopId, new Set([trip.routeId]))
    }
  }
  const result = new Map<string, readonly string[]>()
  for (const [stopId, routeSet] of stopRoutes) {
    result.set(stopId, [...routeSet])
  }
  return result
}

function isWithinBBox(stop: Stop, bbox: BBox): boolean {
  return (
    stop.position.lng >= bbox.minLng &&
    stop.position.lng <= bbox.maxLng &&
    stop.position.lat >= bbox.minLat &&
    stop.position.lat <= bbox.maxLat
  )
}

function groupStopsByName(
  gtfsStops: readonly GtfsStop[],
  stopToRoutes: ReadonlyMap<string, readonly string[]>,
): readonly Stop[] {
  const groups = new Map<string, { stopIds: string[]; lats: number[]; lngs: number[]; routeIds: Set<string> }>()

  for (const s of gtfsStops) {
    const routes = stopToRoutes.get(s.stopId)
    if (!routes) continue

    const existing = groups.get(s.name)
    if (existing) {
      existing.stopIds.push(s.stopId)
      existing.lats.push(s.lat)
      existing.lngs.push(s.lng)
      for (const r of routes) {
        existing.routeIds.add(r)
      }
    } else {
      groups.set(s.name, {
        stopIds: [s.stopId],
        lats: [s.lat],
        lngs: [s.lng],
        routeIds: new Set(routes),
      })
    }
  }

  return Array.from(groups.entries()).map(([name, group]) => ({
    stopId: group.stopIds[0],
    stopIds: group.stopIds,
    name,
    position: {
      lat: group.lats.reduce((sum, v) => sum + v, 0) / group.lats.length,
      lng: group.lngs.reduce((sum, v) => sum + v, 0) / group.lngs.length,
    },
    routeIds: [...group.routeIds],
  }))
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

    const stopTimes = req.app.locals.stopTimes as readonly StopTimeEntry[]
    const stopToRoutes = buildStopToRoutes(stopTimes, staticData.trips)

    const allStops = groupStopsByName(
      Array.from(staticData.stops.values()),
      stopToRoutes,
    )

    const filtered = bbox ? allStops.filter((stop) => isWithinBBox(stop, bbox)) : allStops

    res.json({
      success: true,
      data: filtered as Stop[],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch stops'

    res.status(500).json({
      success: false,
      error: message,
    })
  }
})
