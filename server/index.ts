import { loadConfig } from './config.js'
import { loadGtfsStaticData } from './services/gtfs-static.js'
import { buildRoutePaths } from './services/route-path-builder.js'
import { fetchOverpassRoutes } from './services/overpass.js'
import { createApp } from './app.js'

async function main(): Promise<void> {
  const config = loadConfig()

  console.info('Loading GTFS static data and Overpass routes...')
  const [gtfsResult, overpassPaths] = await Promise.all([
    loadGtfsStaticData(config),
    fetchOverpassRoutes(),
  ])
  const { staticData, stopTimes, shapes } = gtfsResult
  console.info(
    `GTFS data loaded: ${staticData.routes.size} routes, ${staticData.trips.size} trips, ${staticData.stops.size} stops`
  )
  console.info(`Overpass routes: ${overpassPaths.size} lines`)

  const routePaths = buildRoutePaths(staticData, stopTimes, shapes, overpassPaths)
  console.info(`Route paths built: ${routePaths.length} routes`)

  const app = createApp(staticData, config, routePaths)

  const server = app.listen(config.PORT, () => {
    console.info(`Transport map server listening on http://localhost:${config.PORT}`)
  })

  const shutdown = () => {
    console.info('Shutting down gracefully...')
    server.close(() => {
      console.info('Server closed')
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
