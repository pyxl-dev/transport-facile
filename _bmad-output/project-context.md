---
project_name: 'transport-facile'
user_name: 'Yoan'
date: '2026-02-23'
sections_completed:
  ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 42
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Language:** TypeScript 5.7.3 (strict mode, target ES2022, moduleResolution bundler)
- **Module system:** ESM (`"type": "module"` in package.json)
- **Backend:** Express 4.21.1 on Node.js via tsx 4.19.2
- **Frontend:** Vite 6.0.7 + vanilla TypeScript (no UI framework)
- **Map:** MapLibre GL JS 4.7.1
- **Data:** gtfs-realtime-bindings 1.1.1 (CJS), csv-parse 5.6.0, adm-zip 0.5.16
- **Validation:** Zod 3.24.1
- **Tests:** Vitest 2.1.8 (globals, v8 coverage), jsdom 28.0.0
- **Deployment:** Cloudflare Pages + Workers Functions (wrangler, nodejs_compat)
- **Package manager:** pnpm

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- **ESM with .js extensions:** Server imports MUST use `.js` extension (`import { x } from './module.js'`). Frontend imports omit extensions (Vite resolves them).
- **gtfs-realtime-bindings is CJS:** Import in two steps: `import GtfsRealtimeBindings from 'gtfs-realtime-bindings'` then `const { transit_realtime } = GtfsRealtimeBindings`. Direct named imports will fail.
- **Protobuf Long timestamps:** GTFS-RT timestamps can be Long objects, not numbers. Always wrap with `Number()` or use a `toNumber()` helper.
- **Immutability everywhere:** All interfaces use `readonly` fields, `ReadonlyMap`, `ReadonlySet`, `readonly T[]`. Never mutate state — always spread to create new objects.
- **State updater pattern:** State changes via `(prev: AppState) => AppState` functions passed to `store.setState()`. Never mutate `prev` directly.
- **Error handling pattern:** Use `error instanceof Error ? error.message : String(error)`. Services return empty arrays on fetch failure (graceful degradation).
- **ApiResponse<T> wrapper:** All API responses follow `{ success: boolean, data?: T, error?: string }`.
- **Zod for config validation:** Server config validated with Zod schema at startup (`server/config.ts`). All env vars have defaults.

### Framework-Specific Rules

#### Express Backend

- **Shared state via `app.locals`:** Static data, config, routePaths, stopTimes are stored on `app.locals` and accessed in routes with `as` casts (e.g., `req.app.locals.staticData as GtfsStaticData`). Express module augmentation for `express-serve-static-core` does not work — do not attempt it.
- **Router pattern:** Each route is a separate file in `server/routes/` exporting a `Router()` instance. Routes are mounted in `app.ts`.
- **Startup loading:** GTFS static data + Overpass routes are fetched once at startup in `index.ts` via `Promise.all`, then passed to `createApp()`. No dynamic reloading.

#### MapLibre Frontend

- **HTML markers for vehicles:** Vehicles use DOM-based HTML markers managed by `vehicle-marker-manager.ts` (reconciliation pattern with `Map<vehicleId, MarkerEntry>`). Do NOT use GeoJSON symbol/circle layers for vehicles.
- **GeoJSON for routes/stops:** Route paths and stop points use GeoJSON sources with MapLibre layers. Routes and stops use separate sources.
- **Same-source layer conflict:** MapLibre v4.7 — symbol + circle layers on the same GeoJSON source causes circles to not render. Always use separate sources.
- **CSS import:** Use `import 'maplibre-gl/dist/maplibre-gl.css'` in code. CDN import can be blocked by browser tracking prevention.
- **Stop loading by bbox:** Stops are loaded by bounding box on `map.moveend` only at zoom >= 14.

#### Cloudflare Workers (Production)

- **Single catchall function:** All API logic lives in `functions/api/[[catchall]].ts` — one file, no Express. Uses native `Request`/`Response`.
- **Module-scope caching:** GTFS static data is cached in module-scope `let` variables (persist across invocations in same isolate). Arrivals chunks are NOT cached (too many).
- **Asset loading via `env.ASSETS.fetch()`:** Pre-built JSON data files loaded from `/data/*.json` using Cloudflare's asset binding.
- **Timezone gotcha:** Workers run in UTC. GTFS `stop_times` use local time (Europe/Paris). Always use `Intl.DateTimeFormat` with `timeZone: 'Europe/Paris'` to compute day-seconds for schedule comparisons. `new Date().getHours()` will be WRONG.
- **Build pipeline:** `pnpm build:cf` = TypeScript check + Vite build + build GTFS data files. `pnpm deploy:cf` adds wrangler deploy.

### Testing Rules

- **Test location:** Tests in `__tests__/` directories colocated with source (`server/__tests__/`, `src/__tests__/`).
- **Test file naming:** `{module-name}.test.ts` matching the source file name.
- **Globals mode:** Vitest configured with `globals: true` — `describe`, `it`, `expect`, `vi` available without imports.
- **DOM tests:** Files that test DOM code MUST have `// @vitest-environment jsdom` comment at the top of the file. Default environment is `node`.
- **Mocking fetch:** API tests mock `globalThis.fetch` directly. Save and restore original: `const originalFetch = globalThis.fetch` in `beforeEach`/`afterEach`.
- **Mock ZIP buffers:** Use `adm-zip` to create in-memory ZIP files for GTFS static data tests.
- **URL matching in mocks:** When mocking URLs with `.includes('urban')`, note that `'suburban'` also matches. Use regex `/urban/` instead.
- **LoadGtfsResult shape:** `loadGtfsStaticData()` returns `{ staticData, stopTimes, shapes }` — not just `staticData`.
- **Coverage config:** v8 provider, includes `server/**/*.ts` and `src/**/*.ts`, excludes `__tests__/`, `index.ts`, `main.ts`.

### Code Quality & Style Rules

- **File naming:** kebab-case for all files (`vehicle-marker-manager.ts`, `gtfs-realtime.ts`).
- **Types in `src/types.ts`:** All shared types (Vehicle, LineInfo, Stop, etc.) live in a single `src/types.ts` file. Server config type is in `server/config.ts`.
- **No UI framework:** Frontend is vanilla TypeScript. UI components are factory functions (e.g., `createFilterPanel()`, `createLoadingIndicator()`) that take DOM containers and return controller objects.
- **Functional style:** Pure functions preferred. Services are stateless. Store is the only mutable state, managed through immutable update pattern.
- **No linter/formatter configured:** No ESLint or Prettier config in project. Follow existing code style (no semicolons at statement level, consistent use of arrow functions).
- **Small focused files:** Each service, route, and UI component is its own file. Average file ~50-100 lines.

### Development Workflow Rules

- **Dev command:** `pnpm dev` starts both Express server (port 3000) and Vite dev server (port 5173) via `concurrently`.
- **Vite proxy:** In dev, Vite proxies `/api` requests to `http://localhost:3000`. Both servers must be running.
- **Build:** `pnpm build` = `tsc && vite build`. Output to `dist/`.
- **Cloudflare deploy:** `pnpm deploy:cf` = build + build GTFS data + wrangler pages deploy.
- **Commit format:** Conventional commits (`feat:`, `fix:`, `refactor:`, etc.).

### Critical Don't-Miss Rules

- **TaM GTFS-RT feed quirks:** `stopId` is always empty string, `currentStopSequence` is always 0 in VehiclePosition feed. Do NOT rely on these fields. Use `stop_times` static data + vehicle position to compute next stop.
- **Dual architecture awareness:** The app runs in two modes: Express server (local dev/Node) and Cloudflare Workers (production). Both consume the same GTFS-RT feeds but handle static data differently (Express loads at startup from ZIP, Workers load pre-built JSON from assets). Changes to API logic must be reflected in BOTH `server/routes/*.ts` AND `functions/api/[[catchall]].ts`.
- **`new Response(buffer)` needs Uint8Array:** When constructing a Response from an ArrayBuffer in TypeScript, wrap it: `new Uint8Array(buffer)`.
- **UTF-8 BOM in TaM CSV:** TaM urban GTFS CSV files contain a UTF-8 BOM. Use `stripBom()` utility and `bom: true` option in csv-parse.
- **Route path build priority:** Route polylines are built with priority: GTFS shapes > Overpass OSM > stop sequence fallback.
- **Segment-based next stop:** Next stop is computed by finding the closest segment (pair of consecutive stops) to the vehicle position, then returning the end stop of that segment.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-02-23
