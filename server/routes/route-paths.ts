import { Router, type Request, type Response } from 'express'
import type { ApiResponse, RoutePath } from '../../src/types.js'

export const routePathsRouter = Router()

routePathsRouter.get('/', (_req: Request, res: Response<ApiResponse<readonly RoutePath[]>>) => {
  try {
    const routePaths = _req.app.locals.routePaths as readonly RoutePath[] | undefined

    res.json({
      success: true,
      data: routePaths ?? [],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get route paths'

    res.status(500).json({
      success: false,
      error: message,
    })
  }
})
