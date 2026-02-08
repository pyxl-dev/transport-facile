import { loadConfig } from './config.js'
import { loadGtfsStaticData } from './services/gtfs-static.js'
import { createApp } from './app.js'

async function main(): Promise<void> {
  const config = loadConfig()

  console.info('Loading GTFS static data...')
  const staticData = await loadGtfsStaticData(config)
  console.info(
    `GTFS data loaded: ${staticData.routes.size} routes, ${staticData.trips.size} trips, ${staticData.stops.size} stops`
  )

  const app = createApp(staticData, config)

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
