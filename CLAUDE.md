# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start Express server (tsx watch, port 3000) + Vite client (port 5173)
pnpm build            # TypeScript check + Vite build
pnpm build:gtfs       # Build GTFS JSON data files into dist/data/ (for CF deployment)
pnpm build:cf         # Full build (Vite + GTFS data) for deployment
pnpm deploy:cf        # Build + deploy to Cloudflare Pages
pnpm test             # Run all tests (vitest)
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report (v8)

# Run a single test file
pnpm vitest run server/__tests__/gtfs-static.test.ts
```

## Architecture

Real-time TaM Montpellier transit map with two runtime environments:

- **Local dev**: Express backend (Node.js) + Vite frontend (HMR)
- **Production**: Cloudflare Pages Functions + static assets

Both runtimes share services from `server/services/` and must stay in sync. The canonical prod implementation is `functions/api/[[catchall]].ts`. When adding features, implement in the CF handler first, then mirror to Express routes.

### Backend — Production (`functions/api/`)

**API handler** (`[[catchall]].ts`): single file handling all routes — `/api/vehicles`, `/api/lines`, `/api/stops`, `/api/route-paths`, `/api/trip-shapes`, `/api/stops/:id/arrivals`.

**Data flow**: GTFS static data is pre-built at build time (`pnpm build:gtfs`) into JSON files in `dist/data/`. The CF function loads these as assets on demand and caches them in module scope.

### Backend — Local Dev (`server/`)

**Startup sequence** (`index.ts`): validate config (Zod) → fetch GTFS static ZIPs (urban + suburban) → fetch Overpass OSM routes → build route path polylines → create Express app → listen.

**Routes**: `/api/vehicles`, `/api/lines`, `/api/stops` (bbox filtering), `/api/route-paths`, `/api/trip-shapes`, `/api/stops/:id/arrivals`.

### Shared Services (`server/services/`)

Reusable modules imported by Express routes, CF functions, and build scripts:
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

**Data flow**: `main.ts` creates store + map → loads lines/stops/route-paths in parallel → starts 30s polling for vehicles → map `moveend` loads stops by bbox at zoom ≥ 14.

### Types (`src/types.ts`)

`Vehicle`, `LineInfo`, `Stop`, `RoutePath`, `AppState`, `ApiResponse<T>`, GTFS types. Server config type lives in `server/config.ts`.

## Key Gotchas

- **Dual runtime**: Express (dev) and CF Workers (prod) must stay in sync. When modifying API logic, update BOTH `server/routes/` AND `functions/api/[[catchall]].ts`.
- **Timezone**: Both runtimes use `Intl.DateTimeFormat` with `timeZone: 'Europe/Paris'` for GTFS schedule calculations. Never use raw `new Date().getHours()` — CF Workers run in UTC.
- **workerd + WSL2**: `wrangler pages dev` has networking issues under WSL2 (port exhaustion on loopback). Use Express for local dev.
- `gtfs-realtime-bindings` is CJS: `import GtfsRealtimeBindings from 'gtfs-realtime-bindings'` then `const { transit_realtime } = GtfsRealtimeBindings`. Timestamps can be Long objects — always use `Number()`.
- MapLibre v4.7: symbol + circle layers on the **same GeoJSON source** causes circles to not render. Use separate sources or HTML markers.
- MapLibre CSS: use `import 'maplibre-gl/dist/maplibre-gl.css'` (CDN import can be blocked by browser tracking prevention).
- TaM urban GTFS CSV files have UTF-8 BOM — use `stripBom()` and `bom: true` in csv-parse.
- Express module augmentation for `express-serve-static-core` fails — use `app.locals` with `as` casts.
- `new Response(buffer)` needs `new Uint8Array(buffer)` wrapper for TS.
- When mocking URLs with `.includes('urban')`, `'suburban'` also matches — use `/urban/` regex.

## Test Patterns

- Vitest with globals, v8 coverage, 270+ tests across 21 files
- DOM tests need `// @vitest-environment jsdom` comment at file top
- API tests mock `globalThis.fetch`
- `adm-zip` creates mock ZIP buffers in tests
- `loadGtfsStaticData` returns `LoadGtfsResult` with `.staticData`, `.stopTimes`, `.shapes`

## Dev Proxy

Vite proxies `/api` → `http://localhost:3000` in dev. Both must be running (`pnpm dev` handles this).

## Environment Variables

`PORT` (3000), `GTFS_URBAN_RT_URL`, `GTFS_SUBURBAN_RT_URL`, `GTFS_URBAN_STATIC_URL`, `GTFS_SUBURBAN_STATIC_URL`, `GTFS_REFRESH_INTERVAL` (30000ms). All have defaults in `server/config.ts`.
