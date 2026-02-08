import { Router, type Request, type Response } from 'express'
import type { ApiResponse, LineInfo, GtfsStaticData } from '../../src/types.js'

export const linesRouter = Router()

function routeTypeToLineType(routeType: number): 'tram' | 'bus' {
  return routeType === 0 ? 'tram' : 'bus'
}

function sortLines(lines: readonly LineInfo[]): LineInfo[] {
  return [...lines].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'tram' ? -1 : 1
    }
    return a.name.localeCompare(b.name, 'fr')
  })
}

linesRouter.get('/', (_req: Request, res: Response<ApiResponse<LineInfo[]>>) => {
  try {
    const staticData = _req.app.locals.staticData as GtfsStaticData

    const lines: LineInfo[] = Array.from(staticData.routes.values()).map((route) => ({
      id: route.routeId,
      name: route.shortName,
      type: routeTypeToLineType(route.type),
      color: route.color,
    }))

    const sorted = sortLines(lines)

    res.json({
      success: true,
      data: sorted,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch lines'

    res.status(500).json({
      success: false,
      error: message,
    })
  }
})
