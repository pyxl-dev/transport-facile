---
title: 'Groupement des arrêts par nom dans la version Cloudflare'
slug: 'groupement-arrets-cloudflare'
created: '2026-02-23'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: [TypeScript 5.7.3, Cloudflare Pages Functions, Vitest, Node.js ESM]
files_to_modify: [scripts/build-gtfs-data.ts, functions/api/[[catchall]].ts]
code_patterns: [groupStopsByName, build-time-precomputation, immutable-data, module-scope-caching]
test_patterns: [vitest-globals, mock-globalThis-fetch, adm-zip-mock-buffers, makeRequest-pattern]
---

# Tech-Spec: Groupement des arrêts par nom dans la version Cloudflare

**Created:** 2026-02-23

## Overview

### Problem Statement

La version Cloudflare (production) sert les arrêts GTFS bruts — un point par direction — alors que la version locale Express les fusionne par nom via `groupStopsByName()`. Résultat : sur prod, un arrêt comme "Cougourlude" apparaît comme 2+ points séparés (un par direction) au lieu d'un seul marqueur centroïde sur la carte.

### Solution

Déplacer le groupement au **build time** dans `scripts/build-gtfs-data.ts` — écrire un fichier `gtfs-grouped-stops.json` pré-fusionné (format aligné sur le type `Stop`). La fonction Cloudflare charge ce fichier directement au lieu de mapper les GtfsStops bruts individuellement.

### Scope

**In Scope:**
- Groupement par nom dans le build script (moyenne lat/lng, agrégation stopIds + routeIds)
- Nouveau fichier JSON pré-groupé pour Cloudflare (`gtfs-grouped-stops.json`)
- Adaptation de `handleStops` dans `functions/api/[[catchall]].ts` pour charger les stops groupés
- Suppression du code devenu inutile dans `handleStops` (mapping individuel, loadStopRoutes)

**Out of Scope:**
- Distance tram/bus aux arrêts mixtes (sujet séparé)
- Changements côté Express (fonctionne déjà correctement)
- Frontend (déjà compatible `stopIds[]` via `openStopPopup`)

## Context for Development

### Codebase Patterns

- **Build-time precomputation** : le build script pré-calcule déjà trip-stops, stop-routes, arrivals chunks et trip-shapes. Le groupement s'inscrit dans ce pattern.
- **Immutabilité** : toutes les structures utilisent `readonly`. Ne jamais muter.
- **Local = référence** : la logique `groupStopsByName()` dans `server/routes/stops.ts:53-91` est le modèle.
- **Module-scope caching** : la fonction CF cache dans des `let` au scope module.
- **ESM avec extensions .js** : imports serveur avec `.js`.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `server/routes/stops.ts:53-91` | `groupStopsByName()` — logique de référence |
| `scripts/build-gtfs-data.ts` | Build script — ajouter `buildGroupedStops()` |
| `functions/api/[[catchall]].ts:44-88` | Caches module-scope — ajouter `groupedStopsCache` |
| `functions/api/[[catchall]].ts:311-352` | `handleStops` — simplifier |
| `src/types.ts:25-31` | Type `Stop` — contrat cible |

### Technical Decisions

- **Build time > Runtime** : groupement une seule fois au build, zéro coût runtime CF.
- **Format aligné sur `Stop`** : le JSON contient `{ stopId, stopIds, name, position, routeIds }[]`.
- **Garder `gtfs-stops.json`** : encore utilisé par `handleStopArrivals` et `handleVehicles`.
- **`handleStopArrivals` inchangé** : le frontend fait déjà `Promise.all(stopIds.map(...))`.

## Implementation Plan

### Tasks

- [x] Task 1: Créer `buildGroupedStops()` dans le build script
  - File: `scripts/build-gtfs-data.ts`
  - Action: Ajouter une fonction `buildGroupedStops(stops, stopRoutes)` qui :
    1. Groupe les GtfsStops par `name`
    2. Pour chaque groupe : calcule le centroïde (moyenne lat/lng), collecte tous les stopIds, fusionne les routeIds via Set
    3. Retourne un tableau au format `Stop[]` : `{ stopId: firstStopId, stopIds: [...allStopIds], name, position: { lat, lng }, routeIds: [...] }`
  - Notes: Logique identique à `groupStopsByName()` dans `server/routes/stops.ts:53-91` mais prend en entrée les GtfsStops + le mapping stopRoutes déjà calculé au build

- [x] Task 2: Écrire `gtfs-grouped-stops.json` au build
  - File: `scripts/build-gtfs-data.ts`
  - Action: Dans `main()`, après le calcul de `stopRoutes`, appeler `buildGroupedStops()` et écrire le résultat dans `dist/data/gtfs-grouped-stops.json`
  - Notes: Ajouter un log du nombre de stops groupés vs bruts pour vérification

- [x] Task 3: Ajouter `loadGroupedStops()` dans la fonction CF
  - File: `functions/api/[[catchall]].ts`
  - Action:
    1. Ajouter `let groupedStopsCache: readonly Stop[] | null = null` au module scope
    2. Ajouter `async function loadGroupedStops(env, url)` qui charge `/data/gtfs-grouped-stops.json` avec cache module-scope
  - Notes: Suivre le pattern exact des autres loaders (`loadRoutes`, `loadTrips`, etc.)

- [x] Task 4: Simplifier `handleStops` pour utiliser les stops groupés
  - File: `functions/api/[[catchall]].ts`
  - Action:
    1. Remplacer les appels `loadStops` + `loadStopRoutes` par `loadGroupedStops`
    2. Supprimer le mapping individuel `.filter().map()` — les stops sont déjà au format `Stop`
    3. Garder uniquement le filtrage bbox
  - Notes: `loadStopRoutes` reste dans le fichier (potentiellement utilisé ailleurs). `loadStops` aussi (utilisé par `handleStopArrivals`).

### Acceptance Criteria

- [x] AC 1: Given le build script exécuté, when on inspecte `dist/data/gtfs-grouped-stops.json`, then chaque entrée a le format `{ stopId, stopIds, name, position: { lat, lng }, routeIds }` et les stops de même nom sont fusionnés en une seule entrée
- [x] AC 2: Given deux GtfsStops avec le même `name` ("Cougourlude") et des stopIds différents, when `buildGroupedStops()` est appelé, then un seul Stop est produit avec `position` au centroïde des deux et `stopIds` contenant les deux IDs
- [x] AC 3: Given un GtfsStop sans routes associées dans `stopRoutes`, when `buildGroupedStops()` est appelé, then ce stop est exclu du résultat (même comportement que `groupStopsByName`)
- [x] AC 4: Given la fonction CF déployée, when on appelle `GET /api/stops?bbox=...`, then les stops retournés ont `stopIds` en tableau et les arrêts bidirectionnels sont fusionnés (même résultat qu'en local)
- [x] AC 5: Given la fonction CF déployée, when on clique sur un stop groupé dans la carte, then les arrivées des deux directions s'affichent dans le popup (le frontend fait `Promise.all` sur tous les `stopIds`)
- [x] AC 6: Given `pnpm test` exécuté, when tous les tests passent, then aucune régression introduite

## Additional Context

### Dependencies

- Aucune nouvelle dépendance requise.
- Le fichier `gtfs-stop-routes.json` doit être calculé AVANT `buildGroupedStops()` (il en est l'input).

### Testing Strategy

- **Test unitaire** : tester `buildGroupedStops()` avec des données synthétiques (2 stops même nom → 1 stop groupé, stop sans routes → exclu)
- **Tests existants** : `pnpm test` doit rester vert — aucun fichier existant testé n'est modifié de façon breaking
- **Validation build** : `pnpm build:cf` produit `dist/data/gtfs-grouped-stops.json` et le log montre le delta stops bruts vs groupés
- **Validation visuelle** : déployer sur CF et vérifier que "Cougourlude" n'apparaît plus qu'une fois sur la carte

### Notes

- Le frontend est déjà compatible : `openStopPopup` reçoit `stopIds[]`, `stop-layer.ts` stocke `stopIds` en GeoJSON property, et le popup fait `Promise.all(stopIds.map(fetchStopArrivals))`.
- `handleStopArrivals` dans le CF catchall n'a pas besoin de changement — il traite un stopId à la fois, le frontend gère la parallélisation.
- Le type `Stop` dans `src/types.ts` a déjà `stopIds: readonly string[]` — aucun changement de contrat.
- Risque faible : le build script est déterministe, pas de side effects runtime.

## Review Notes
- Adversarial review completed (20 findings)
- Findings: 20 total, 1 fixed (edge case test ajouté), 19 skipped (faux positifs — patterns identiques au codebase existant)
- Resolution approach: fix automatique du seul finding réel + skip des faux positifs
