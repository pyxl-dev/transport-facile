import { fetchOverpassRoutes } from '../services/overpass.js'
import { saveCacheToDisk } from '../services/overpass-cache.js'

async function main(): Promise<void> {
  console.info('Fetching Overpass routes for TaM Montpellier...')

  const routes = await fetchOverpassRoutes()

  if (routes.size === 0) {
    console.error('No routes fetched from Overpass API. Cache not updated.')
    process.exit(1)
  }

  await saveCacheToDisk(routes)
  console.info(`Cache updated: ${routes.size} routes saved to data/overpass-cache.json`)
}

main().catch((error) => {
  console.error('Failed to refresh Overpass cache:', error)
  process.exit(1)
})
