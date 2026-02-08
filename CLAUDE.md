# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start server (tsx watch, port 3000) + client (Vite, port 5173)
pnpm build            # TypeScript check + Vite build
pnpm test             # Run all tests (vitest)
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report (v8)

# Run a single test file
pnpm vitest run server/__tests__/gtfs-static.test.ts
```

## Architecture

Real-time TaM Montpellier transit map. Express backend proxies CORS-less TaM APIs; Vite + vanilla TypeScript + MapLibre GL JS frontend renders vehicles, routes, and stops on a map.

### Backend (`server/`)

**Startup sequence** (`index.ts`): validate config (Zod) → fetch GTFS static ZIPs (urban + suburban) → fetch Overpass OSM routes → build route path polylines → create Express app → listen.

**Routes**: `/api/vehicles` (real-time positions), `/api/lines`, `/api/stops` (bbox filtering), `/api/route-paths` (pre-computed at startup).

**Services**:
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

- `gtfs-realtime-bindings` is CJS: `import GtfsRealtimeBindings from 'gtfs-realtime-bindings'` then `const { transit_realtime } = GtfsRealtimeBindings`. Timestamps can be Long objects — always use `Number()`.
- MapLibre v4.7: symbol + circle layers on the **same GeoJSON source** causes circles to not render. Use separate sources or HTML markers.
- MapLibre CSS: use `import 'maplibre-gl/dist/maplibre-gl.css'` (CDN import can be blocked by browser tracking prevention).
- TaM urban GTFS CSV files have UTF-8 BOM — use `stripBom()` and `bom: true` in csv-parse.
- Express module augmentation for `express-serve-static-core` fails — use `app.locals` with `as` casts.
- `new Response(buffer)` needs `new Uint8Array(buffer)` wrapper for TS.
- When mocking URLs with `.includes('urban')`, `'suburban'` also matches — use `/urban/` regex.

## Test Patterns

- Vitest with globals, v8 coverage, 115+ tests across 12 files
- DOM tests need `// @vitest-environment jsdom` comment at file top
- API tests mock `globalThis.fetch`
- `adm-zip` creates mock ZIP buffers in tests
- `loadGtfsStaticData` returns `LoadGtfsResult` with `.staticData`, `.stopTimes`, `.shapes`

## Dev Proxy

Vite proxies `/api` → `http://localhost:3000` in dev. Both must be running (`pnpm dev` handles this).

## Environment Variables

`PORT` (3000), `GTFS_URBAN_RT_URL`, `GTFS_SUBURBAN_RT_URL`, `GTFS_URBAN_STATIC_URL`, `GTFS_SUBURBAN_STATIC_URL`, `GTFS_REFRESH_INTERVAL` (30000ms). All have defaults in `server/config.ts`.
