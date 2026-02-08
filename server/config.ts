import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  GTFS_URBAN_RT_URL: z
    .string()
    .url()
    .default('https://data.montpellier3m.fr/GTFS/Urbain/VehiclePosition.pb'),
  GTFS_SUBURBAN_RT_URL: z
    .string()
    .url()
    .default('https://data.montpellier3m.fr/GTFS/Suburbain/VehiclePosition.pb'),
  GTFS_URBAN_STATIC_URL: z
    .string()
    .url()
    .default('https://data.montpellier3m.fr/GTFS/Urbain/GTFS.zip'),
  GTFS_SUBURBAN_STATIC_URL: z
    .string()
    .url()
    .default('https://data.montpellier3m.fr/GTFS/Suburbain/GTFS.zip'),
  GTFS_REFRESH_INTERVAL: z.coerce.number().default(30000),
})

export type Config = z.infer<typeof envSchema>

export function loadConfig(): Config {
  return envSchema.parse(process.env)
}
