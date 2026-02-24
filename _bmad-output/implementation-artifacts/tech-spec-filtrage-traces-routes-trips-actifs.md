---
title: 'Filtrage des traces de routes par trips actifs'
slug: 'filtrage-traces-routes-trips-actifs'
created: '2026-02-23'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript 5.7.3', 'Express 4.21.1', 'Cloudflare Workers', 'MapLibre GL JS 4.7.1', 'Vitest 2.1.8', 'gtfs-realtime-bindings 1.1.1', 'Zod 3.24.1']
files_to_modify:
  - 'src/types.ts'
  - 'server/services/route-path-builder.ts'
  - 'server/routes/vehicles.ts'
  - 'server/routes/route-paths.ts'
  - 'src/main.ts'
  - 'src/state.ts'
  - 'src/services/api.ts'
  - 'functions/api/[[catchall]].ts'
  - 'scripts/build-gtfs-data.ts'
  - 'server/__tests__/route-path-builder.test.ts'
code_patterns:
  - 'Immutable state with readonly interfaces and spread operators'
  - 'State updater pattern: (prev: AppState) => AppState via store.setState()'
  - 'ApiResponse<T> wrapper: { success, data?, error? }'
  - 'Dual architecture: Express (dev) + CF Worker (prod)'
  - 'Route path build priority: GTFS shapes > Overpass OSM > stop sequences'
  - 'Vehicle enrichment: RawVehiclePosition + staticData -> Vehicle'
  - 'Module-scope caching in CF Worker'
  - 'app.locals for shared state in Express'
test_patterns:
  - 'Vitest with globals: true, v8 coverage'
  - 'createStaticData() helper for mock GTFS data'
  - 'Mock ReadonlyMap for shapes, trips, stops'
---

# Tech-Spec: Filtrage des traces de routes par trips actifs

**Created:** 2026-02-23

## Overview

### Problem Statement

Toutes les variantes de shapes GTFS sont affichees pour chaque ligne de transport (parcours travaux, boucles alternatives desactivees, anciens itineraires), ce qui surcharge visuellement la carte. Le cas le plus flagrant est la ligne 4 ou seule la boucle Garcia Lorca est active, mais plusieurs autres traces obsoletes sont dessinees. Ce probleme affecte potentiellement toutes les lignes ayant des variantes multiples.

### Solution

Enrichir le type `RoutePath` avec un `shapeId` identifiant chaque variante, et ajouter un champ `tripId` sur le type `Vehicle` front. A chaque poll vehicules (30s), le frontend croise les tripIds actifs avec les shapes via un mapping trip→shape pre-charge. Seuls les shapes actifs sont affiches. Les routes sans vehicule actif affichent un "default shape" — le shapeId associe au plus grand nombre de trips dans les donnees GTFS statiques.

### Scope

**In Scope:**
- Ajout de `shapeId` sur `RoutePath` et `tripId` sur `Vehicle`
- Nouveau endpoint `/api/trip-shapes` renvoyant le mapping tripId→shapeId et routeId→defaultShapeId
- Filtrage dynamique des route paths dans le frontend a chaque poll vehicules
- Fallback sur le default shape quand 0 vehicule circule sur une route
- Express backend ET Cloudflare Worker (production)
- Toutes les lignes

**Out of Scope:**
- Modification du systeme d'arrets/stops
- Changement du polling interval (30s)
- Redesign UI du filter panel

## Context for Development

### Architecture Actuelle

**Flux actuel des route paths :**
1. **Startup (Express)** : `buildRoutePaths()` genere TOUTES les variantes de shapes distincts par route → `app.locals.routePaths`
2. **Build (CF)** : `build-gtfs-data.ts` genere `dist/data/gtfs-route-paths.json` avec toutes les variantes
3. **Runtime** : `/api/route-paths` renvoie les paths bruts sans filtrage
4. **Frontend** : charge les route paths UNE FOIS au init, affiche tout

**Flux des vehicules (a exploiter) :**
- GTFS-RT VehiclePosition → `RawVehiclePosition.tripId` (fiable)
- `GtfsTrip.shapeId` (optionnel) lie chaque trip a son shape
- Le front poll les vehicules toutes les 30s

### Codebase Patterns

- **Immutabilite** : `readonly` partout, spread pour new objects
- **State updater** : `(prev: AppState) => AppState` via `store.setState()`
- **ApiResponse<T>** : `{ success, data?, error? }`
- **Dual archi** : Express (dev) + CF Worker (prod)
- **app.locals** pour Express, module-scope `let` pour CF Worker

### Technical Decisions

1. **Mapping trip→shape servi par un endpoint dedie `/api/trip-shapes`** : plutot que de surcharger la reponse vehicules, on sert un fichier JSON compact charge une fois au init front. Ce fichier contient `{ tripShapes: Record<tripId, shapeId>, defaultShapes: Record<routeId, shapeId> }`.

2. **`shapeId` ajoute sur `RoutePath`** : Permet au front de filtrer les route paths par shapeId actif. Pour les paths Overpass/stop-sequence (pas de shape GTFS), on utilise un ID synthetique `fallback-{routeId}` — comme il n'y a qu'un seul path pour ces routes, le filtrage est transparent.

3. **`tripId` ajoute sur `Vehicle` (type front)** : Necessaire pour le lookup trip→shape cote client. Deja disponible dans `RawVehiclePosition.tripId` et dans `enrichVehicles()`.

4. **Pre-calcul du default shape** : Le shapeId ayant le plus de trips associes pour chaque route. Calcule dans `route-path-builder.ts` et exporte via le endpoint/fichier JSON.

## Implementation Plan

### Tasks

- [ ] Task 1: Ajouter `shapeId` sur le type `RoutePath`
  - File: `src/types.ts`
  - Action: Ajouter `readonly shapeId: string` a l'interface `RoutePath`
  - Notes: Champ obligatoire. Pour les paths Overpass/stop-sequence sans shape GTFS, utiliser `fallback-{routeId}`

- [ ] Task 2: Ajouter `tripId` sur le type `Vehicle` (front)
  - File: `src/types.ts`
  - Action: Ajouter `readonly tripId: string` a l'interface `Vehicle`
  - Notes: Necessaire pour le lookup trip→shape cote client

- [ ] Task 3: Modifier `buildRoutePaths()` pour inclure `shapeId`
  - File: `server/services/route-path-builder.ts`
  - Action: Dans `makeRoutePath()`, ajouter le parametre `shapeId` et le propager. Dans `findAllDistinctShapes()`, retourner les shapeIds avec les coordinates. Pour les paths Overpass et stop-sequence, generer `fallback-{routeId}`.
  - Notes: Modifier aussi la signature pour que `findAllDistinctShapes()` retourne `{ shapeId: string, coordinates: Coordinates }[]` au lieu de `Coordinates[]`

- [ ] Task 4: Creer `buildDefaultShapeMap()` et `buildTripShapeMap()`
  - File: `server/services/route-path-builder.ts`
  - Action: Exporter deux nouvelles fonctions :
    - `buildDefaultShapeMap(staticData, stopTimes, shapes)` → `ReadonlyMap<routeId, shapeId>` : pour chaque route, le shapeId associe au plus grand nombre de trips. Pour les routes sans shape, `fallback-{routeId}`.
    - `buildTripShapeMap(staticData)` → `ReadonlyMap<tripId, shapeId>` : pour chaque trip, son shapeId. Pour les trips sans shape, `fallback-{routeId}`.
  - Notes: Ces deux fonctions sont pures, sans effet de bord.

- [ ] Task 5: Ajouter `tripId` dans `enrichVehicles()` et la route Express
  - File: `server/services/vehicle-enricher.ts`, `server/routes/vehicles.ts`
  - Action: Propager `raw.tripId` dans l'objet `Vehicle` retourne par `enrichVehicles()`. Aucun changement necessaire dans la route Express (elle serialise deja tout le Vehicle).
  - Notes: Le tripId est deja disponible dans `raw.tripId`

- [ ] Task 6: Creer le endpoint Express `/api/trip-shapes`
  - File: `server/routes/trip-shapes.ts` (nouveau fichier), `server/app.ts`
  - Action: Creer un nouveau router qui sert `{ tripShapes: Record<string, string>, defaultShapes: Record<string, string> }` depuis les donnees pre-calculees dans `app.locals`. Monter dans `app.ts`.
  - Notes: Les maps sont calculees au startup dans `index.ts` et passees a `createApp()`

- [ ] Task 7: Calculer et stocker les maps au startup Express
  - File: `server/index.ts`
  - Action: Appeler `buildTripShapeMap()` et `buildDefaultShapeMap()` apres le chargement des donnees statiques. Passer les resultats a `createApp()`.
  - Notes: Ajouter les deux maps a `app.locals`

- [ ] Task 8: Adapter `createApp()` pour accepter les nouvelles donnees
  - File: `server/app.ts`
  - Action: Ajouter les parametres `tripShapeMap` et `defaultShapeMap` a `createApp()`. Les stocker dans `app.locals`. Monter le nouveau router `/api/trip-shapes`.

- [ ] Task 9: Generer les donnees trip-shapes pour CF
  - File: `scripts/build-gtfs-data.ts`
  - Action: Appeler `buildTripShapeMap()` et `buildDefaultShapeMap()`, ecrire le resultat dans `dist/data/gtfs-trip-shapes.json` au format `{ tripShapes: Record<string, string>, defaultShapes: Record<string, string> }`
  - Notes: Ajouter `shapeId` dans la serialisation de `gtfs-route-paths.json` aussi

- [ ] Task 10: Ajouter le handler CF Worker pour `/api/trip-shapes`
  - File: `functions/api/[[catchall]].ts`
  - Action: Ajouter `tripShapesCache`, `loadTripShapes()`, et `handleTripShapes()` suivant le pattern existant des autres handlers. Ajouter le routage `if (path === 'trip-shapes')`.
  - Notes: Ajouter aussi `tripId` dans la construction du Vehicle dans `handleVehicles()`

- [ ] Task 11: Ajouter le client API `fetchTripShapes()`
  - File: `src/services/api.ts`
  - Action: Creer l'interface `TripShapesData { tripShapes: Record<string, string>, defaultShapes: Record<string, string> }` et la fonction `fetchTripShapes()` appelant `/api/trip-shapes`
  - Notes: Le type peut aller dans `src/types.ts`

- [ ] Task 12: Ajouter `tripShapesData` au state et la logique de filtrage
  - File: `src/state.ts`, `src/types.ts`
  - Action:
    - Ajouter `readonly tripShapesData: TripShapesData | null` a `AppState`
    - Creer `setTripShapesData()` state updater
    - Modifier `getFilteredRoutePaths()` : extraire les shapeIds actifs des vehicules via `tripShapesData.tripShapes`, puis filtrer les routePaths par shapeId actif. Pour les routes sans vehicule actif, inclure le routePath dont le shapeId === `defaultShapes[routeId]`.
  - Notes: Si `tripShapesData` est null (pas encore charge), retourner tous les route paths (comportement actuel = fallback gracieux)

- [ ] Task 13: Charger trip-shapes au init et recalculer a chaque poll
  - File: `src/main.ts`
  - Action:
    - Ajouter `fetchTripShapes()` dans `loadInitialData()` (en parallele avec lines, stops, routePaths)
    - Stocker avec `store.setState(setTripShapesData(data))`
  - Notes: Le recalcul des route paths filtres est automatique — `getFilteredRoutePaths()` est appele dans le subscriber du store a chaque changement de state (donc a chaque `setVehicles()`)

- [ ] Task 14: Mettre a jour les tests existants
  - File: `server/__tests__/route-path-builder.test.ts`
  - Action: Adapter les assertions pour inclure `shapeId` sur les RoutePath retournes. Ajouter des tests pour `buildDefaultShapeMap()` et `buildTripShapeMap()`.
  - Notes: Utiliser le pattern `createStaticData()` existant

- [ ] Task 15: Ajouter les tests de filtrage state
  - File: `src/__tests__/state.test.ts`
  - Action: Ajouter des tests pour `getFilteredRoutePaths()` avec `tripShapesData` : cas vehicule actif, cas aucun vehicule (fallback default), cas `tripShapesData` null (tous les paths).
  - Notes: `// @vitest-environment jsdom` n'est PAS necessaire (pure state logic)

### Acceptance Criteria

- [ ] AC 1: Given une ligne avec 4 variantes de shapes et 1 vehicule actif sur le shape "SH-A", when le frontend affiche les route paths, then seul le trace correspondant a "SH-A" est affiche pour cette ligne
- [ ] AC 2: Given une ligne sans vehicule actif (hors service), when le frontend affiche les route paths, then le trace par defaut (shape le plus frequent) est affiche pour cette ligne
- [ ] AC 3: Given `tripShapesData` pas encore charge (null), when le frontend affiche les route paths, then tous les route paths sont affiches (comportement de fallback gracieux)
- [ ] AC 4: Given un vehicule dont le trip n'a pas de shapeId dans les donnees GTFS, when le filtrage s'execute, then le route path `fallback-{routeId}` est utilise (path Overpass ou stop-sequence)
- [ ] AC 5: Given le endpoint `/api/trip-shapes` en Express, when un client GET, then il recoit `{ success: true, data: { tripShapes: {...}, defaultShapes: {...} } }`
- [ ] AC 6: Given le endpoint `/api/trip-shapes` en CF Worker, when un client GET, then il recoit le meme format de reponse qu'en Express
- [ ] AC 7: Given le type `RoutePath`, when il est serialise par l'API, then il contient le champ `shapeId`
- [ ] AC 8: Given le type `Vehicle` front, when il est serialise par l'API, then il contient le champ `tripId`
- [ ] AC 9: Given deux lignes (une avec vehicule, une sans), when le frontend affiche les traces, then la ligne avec vehicule montre le shape actif ET la ligne sans vehicule montre le default shape
- [ ] AC 10: Given les tests existants dans `route-path-builder.test.ts`, when on execute `pnpm test`, then tous les tests passent (y compris les nouveaux)
- [ ] AC 11: Given `pnpm build`, when la compilation TypeScript s'execute, then aucune erreur de type

## Additional Context

### Dependencies

- Aucune nouvelle dependance npm
- `gtfs-realtime-bindings` (existant) pour le decodage des feeds RT
- Donnees GTFS statiques (existant) : trips avec `shapeId`, shapes avec les coordonnees
- Overpass OSM (existant) pour les routes sans shapes GTFS

### Testing Strategy

**Tests unitaires :**
- `buildRoutePaths()` : verifier que `shapeId` est present et correct sur chaque `RoutePath`
- `buildDefaultShapeMap()` : verifier que le shape avec le plus de trips est selectionne
- `buildTripShapeMap()` : verifier le mapping tripId→shapeId avec et sans shapeId
- `getFilteredRoutePaths()` : verifier le filtrage par shapes actifs, le fallback default, et le cas null

**Tests d'integration :**
- Endpoint `/api/trip-shapes` Express : verifier la structure de la reponse
- Build CF : verifier que `gtfs-trip-shapes.json` et `gtfs-route-paths.json` (avec shapeId) sont generes

**Tests manuels :**
- Ouvrir la carte en dev (`pnpm dev`) et verifier visuellement que la ligne 4 n'affiche qu'un seul trace (la boucle Garcia Lorca active)
- Verifier qu'en dehors des heures de service, les traces par defaut sont affiches
- Deployer sur CF (`pnpm deploy:cf`) et verifier le meme comportement en production

### Notes

**Risques identifies :**
- Les shapes GTFS peuvent changer lors d'une mise a jour des donnees TaM. Le mapping trip→shape est recalcule a chaque startup (Express) ou rebuild (CF), donc pas de risque de desynchronisation.
- Les trips sans `shapeId` (lignes bus sans shapes GTFS) utilisent le fallback ID synthetique. Le filtrage est transparent car il n'y a qu'un seul path par route dans ce cas.
- Le fichier `gtfs-trip-shapes.json` peut etre volumineux si beaucoup de trips. Optimisation possible : ne garder que les trips des routes ayant des shapes multiples. Hors scope de cette spec.

**Limitations connues :**
- Le filtrage est base sur les vehicules actuellement en circulation. Si un shape n'est utilise que par des trips qui roulent la nuit, il ne sera visible que la nuit.
- Les routes qui n'ont jamais de vehicule GTFS-RT (lignes scolaires, etc.) afficheront toujours le default shape.
