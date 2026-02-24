# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (CF-first workflow)
pnpm dev:preview      # Vite HMR (frontend) + API proxied to CF preview deployment
pnpm deploy:preview   # Build + deploy to CF preview branch (preview.transport-facile.pages.dev)
pnpm deploy:cf        # Build + deploy to CF production

# Build
pnpm build            # TypeScript check + Vite build
pnpm build:gtfs       # Build GTFS JSON data files into dist/data/ (for CF deployment)
pnpm build:cf         # Full build (Vite + GTFS data) for deployment

# Testing
pnpm test             # Run all tests (vitest)
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report (v8)

# Run a single test file
pnpm vitest run server/__tests__/gtfs-static.test.ts

# Legacy (Express — will be removed)
pnpm dev              # Express server (port 3000) + Vite client (port 5173) — deprecated
pnpm dev:cf           # Build CF + wrangler pages dev (broken on WSL2) — deprecated
```

## Dev Workflow

**CF-first development** — no Express, no local Workers emulation:

1. **Frontend changes** → `pnpm dev:preview` — Vite HMR on `:5173`, `/api` proxied to preview CF deployment
2. **API changes** → edit `functions/api/[[catchall]].ts` → `pnpm deploy:preview` (~30s) → test on preview URL or via Vite proxy
3. **Ready for prod** → `pnpm deploy:cf`

**Preview URL**: `https://preview.transport-facile.pages.dev`

## Architecture

Real-time TaM Montpellier transit map deployed on Cloudflare Pages.

### Backend — Cloudflare Pages Functions (`functions/api/`)

**API handler** (`[[catchall]].ts`): single file handling all routes — `/api/vehicles`, `/api/lines`, `/api/stops`, `/api/route-paths`, `/api/trip-shapes`, `/api/stops/:id/arrivals`.

**Data flow**: GTFS static data is pre-built at build time (`pnpm build:gtfs`) into JSON files in `dist/data/`. The CF function loads these as assets on demand and caches them in module scope.

This is the **canonical and only** API implementation. Express routes in `server/routes/` are legacy and will be removed.

### Shared Services (`server/services/`)

Reusable modules imported by CF functions and build scripts:
- `gtfs-realtime.ts` — decodes protobuf feeds via `gtfs-realtime-bindings`
- `gtfs-static.ts` — parses GTFS ZIP/CSV (handles UTF-8 BOM), merges urban + suburban
- `route-path-builder.ts` — builds polylines with priority: GTFS shapes → Overpass OSM → stop sequences
- `vehicle-enricher.ts` — joins vehicle positions with trip/route metadata
- `overpass.ts` — fetches OSM transit route geometry

### Frontend (`src/`)

**State** (`state.ts`): immutable store pattern — updater functions return `(prev: AppState) => AppState`, listener subscriptions notify on changes.

**Map layers** (`map/`):
- Vehicle positions use **HTML markers** (not GeoJSON circles/symbols) managed by `vehicle-marker-manager.ts` which reconciles a `Map<vehicleId, MarkerEntry>` each poll cycle
- Route paths and stops use **GeoJSON sources** with MapLibre layers

**Data flow**: `main.ts` creates store + map → loads lines/stops/route-paths in parallel → starts 30s polling for vehicles (wall-clock aligned) → map `moveend` loads stops by bbox at zoom ≥ 14.

### Types (`src/types.ts`)

`Vehicle`, `LineInfo`, `Stop`, `RoutePath`, `AppState`, `ApiResponse<T>`, GTFS types. Server config type lives in `server/config.ts`.

## Key Gotchas

- **CF-first**: The canonical API lives in `functions/api/[[catchall]].ts`. Express routes in `server/routes/` are legacy — do NOT add new features there.
- **Timezone**: CF Workers run in UTC. Use `Intl.DateTimeFormat` with `timeZone: 'Europe/Paris'` for GTFS schedule calculations. Never use raw `new Date().getHours()`.
- **workerd + WSL2**: `wrangler pages dev` has networking issues under WSL2. Use `pnpm dev:preview` (Vite + CF preview) instead.
- `gtfs-realtime-bindings` is CJS: `import GtfsRealtimeBindings from 'gtfs-realtime-bindings'` then `const { transit_realtime } = GtfsRealtimeBindings`. Timestamps can be Long objects — always use `Number()`.
- MapLibre v4.7: symbol + circle layers on the **same GeoJSON source** causes circles to not render. Use separate sources or HTML markers.
- MapLibre CSS: use `import 'maplibre-gl/dist/maplibre-gl.css'` (CDN import can be blocked by browser tracking prevention).
- TaM urban GTFS CSV files have UTF-8 BOM — use `stripBom()` and `bom: true` in csv-parse.
- `new Response(buffer)` needs `new Uint8Array(buffer)` wrapper for TS.
- When mocking URLs with `.includes('urban')`, `'suburban'` also matches — use `/urban/` regex.

## Test Patterns

- Vitest with globals, v8 coverage, 270+ tests across 21 files
- DOM tests need `// @vitest-environment jsdom` comment at file top
- API tests mock `globalThis.fetch`
- `adm-zip` creates mock ZIP buffers in tests
- `loadGtfsStaticData` returns `LoadGtfsResult` with `.staticData`, `.stopTimes`, `.shapes`

## Dev Proxy

Vite proxies `/api` to the CF preview deployment by default (`https://preview.transport-facile.pages.dev`). Override with `VITE_API_TARGET` env var for custom targets.

## Environment Variables

`PORT` (3000), `GTFS_URBAN_RT_URL`, `GTFS_SUBURBAN_RT_URL`, `GTFS_URBAN_STATIC_URL`, `GTFS_SUBURBAN_STATIC_URL`, `GTFS_REFRESH_INTERVAL` (30000ms). All have defaults in `server/config.ts`.
