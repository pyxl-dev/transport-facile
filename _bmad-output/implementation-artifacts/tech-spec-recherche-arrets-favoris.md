---
title: 'Recherche d arrêts et favoris'
slug: 'recherche-arrets-favoris'
created: '2026-02-23'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript 5.7', 'MapLibre GL JS 4.7', 'Vanilla TS (no framework)', 'localStorage', 'Zod 3.24', 'Vitest']
files_to_modify: ['src/config.ts', 'src/types.ts', 'src/state.ts', 'src/services/favorites-storage.ts', 'src/ui/stop-popup.ts', 'src/map/stop-layer.ts', 'src/main.ts', 'src/styles.css']
files_to_create: ['src/ui/search-bar.ts', 'src/ui/favorites-stops-panel.ts', 'src/services/stop-favorites-storage.ts', 'src/map/stop-popup-opener.ts']
code_patterns: ['factory-function-ui', 'immutable-state-updaters', 'store-subscribe-render', 'localstorage-zod-validation']
test_patterns: ['vitest-globals', 'jsdom-environment-comment', 'mock-globalThis-fetch', 'localstorage-mock']
---

# Tech-Spec: Recherche d'arrêts et favoris

**Created:** 2026-02-23

## Overview

### Problem Statement

Actuellement, pour consulter les horaires d'un arrêt sur la carte Transport Facile, l'utilisateur doit zoomer manuellement jusqu'au niveau 14+, trouver visuellement l'arrêt, puis cliquer dessus. C'est laborieux pour les arrêts fréquemment consultés et rend la découverte d'arrêts par nom impossible sans connaissance géographique préalable.

### Solution

Ajouter une barre de recherche flottante au-dessus de la carte permettant de chercher un arrêt par nom, avec fly-to automatique et ouverture de la popup d'horaires au clic sur un résultat. Ajouter un système de favoris d'arrêts avec un bouton d'accès rapide séparé sur la carte, et une étoile dans la popup d'arrêt pour ajouter/retirer des favoris.

### Scope

**In Scope:**
- Barre de recherche flottante avec filtrage textuel des arrêts (client-side)
- Dropdown de résultats avec clic → fly-to + popup d'horaires automatique
- Système de favoris d'arrêts persistés en localStorage
- Bouton favoris séparé sur la carte avec liste déroulante des arrêts favoris
- Étoile dans la popup d'arrêt pour ajouter/retirer des favoris

**Out of Scope:**
- Recherche server-side / nouvel endpoint API
- Favoris synchronisés (cloud/compte utilisateur)
- Recherche de lignes ou véhicules
- Auto-complétion avancée / fuzzy matching
- Modification du backend

## Context for Development

### Codebase Patterns

- **UI Components** : Factory functions (`createFilterPanel()`, `createLoadingIndicator()`) qui prennent un conteneur DOM et retournent un objet contrôleur. Pas de framework — vanilla TypeScript pur.
- **State Management** : Immutable store pattern dans `state.ts`. Les updaters retournent `(prev: AppState) => AppState`. Subscription via `store.subscribe()`.
- **localStorage** : Validé avec Zod schema dans `favorites-storage.ts`. Pattern load/save/clear avec gestion silencieuse des erreurs.
- **MapLibre Popups** : Créés programmatiquement via `new maplibregl.Popup()`. Contenu HTML via `setHTML()`. Arrivées chargées async après ouverture.
- **CSS** : Fichier unique `styles.css`. Conventions BEM-like (`stop-popup__name`, `filter-chip--active`). Variables inline via `style` attributes pour les couleurs dynamiques.
- **Favorite Icon** : `createFavoriteButton()` retourne un `HTMLSpanElement` avec SVG star outline/filled, `role="button"`, `aria-pressed`.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/state.ts` | Store immutable, `favoriteLines` comme modèle pour `favoriteStops` |
| `src/services/favorites-storage.ts` | Pattern localStorage + Zod pour favoris lignes — à réutiliser pour arrêts |
| `src/ui/favorite-icon.ts` | Bouton étoile SVG réutilisable pour la popup d'arrêt |
| `src/ui/stop-popup.ts` | Popup HTML d'arrêt — ajouter le bouton favori ici |
| `src/map/stop-layer.ts` | Logique d'ouverture popup (lignes 149-189) — à extraire en fonction réutilisable |
| `src/ui/filter-panel.ts` | Modèle pour le panel favoris (bottom sheet pattern, overlay) |
| `src/config.ts` | Constantes — ajouter clé localStorage pour favoris arrêts |
| `src/types.ts` | Types — ajouter `FavoriteStop` interface |
| `src/main.ts` | Wiring — brancher search bar, favorites panel, persister favoris |
| `src/styles.css` | Styles — ajouter search bar, favorites button, favorites panel |

### Technical Decisions

- **Recherche client-side** : Tous les arrêts (~500-800) sont chargés au démarrage via `fetchStops()`. Filtrage par `String.normalize('NFD').replace(...)` + `includes()` pour recherche accent-insensitive.
- **Favoris arrêts en localStorage** : Même pattern que `favorites-storage.ts` pour les lignes, avec Zod validation. Clé séparée `tam-favorite-stops`.
- **Bouton favoris séparé** : Positionné en bottom-left à côté du bouton filter existant (filter à `left: 16px`, favoris à `left: 72px`).
- **Extraction `openStopPopup()`** : La logique popup dans `stop-layer.ts` (lignes 149-189) sera extraite dans `stop-popup-opener.ts` pour être réutilisée par search et favorites.
- **FavoriteStop stocke les données minimales** : `{ stopId, stopIds, name, position }` — suffisant pour fly-to + popup sans refetch.
- **Étoile dans popup** : Ajoutée dans le header de `createStopPopupContent()`, toggle via event delegation sur le popup DOM.

## Implementation Plan

### Tasks

- [x] Task 1: Ajouter types et constantes de base
  - File: `src/types.ts`
  - Action: Ajouter l'interface `FavoriteStop` avec les champs `readonly stopId: string`, `readonly stopIds: readonly string[]`, `readonly name: string`, `readonly position: Position`
  - File: `src/config.ts`
  - Action: Ajouter `export const FAVORITE_STOPS_STORAGE_KEY = 'tam-favorite-stops'` et `export const SEARCH_MIN_CHARS = 2` et `export const SEARCH_MAX_RESULTS = 8` et `export const SEARCH_FLY_ZOOM = 17`
  - Notes: `FavoriteStop` est un sous-ensemble de `Stop` sans `routeIds` — on garde le minimum pour fly-to + popup

- [x] Task 2: Ajouter state management pour favoris arrêts
  - File: `src/state.ts`
  - Action: Ajouter `favoriteStops: readonly FavoriteStop[]` à `AppState` (initialState: `[]`). Ajouter les updaters `addFavoriteStop(stop: FavoriteStop)`, `removeFavoriteStop(stopId: string)`, `setFavoriteStops(stops: readonly FavoriteStop[])`. `addFavoriteStop` vérifie si le stop existe déjà (par `stopId`).
  - Notes: On utilise un tableau (pas un Set) car on stocke des objets, pas des IDs simples. L'immutabilité est respectée via spread.

- [x] Task 3: Créer le service de persistance localStorage pour favoris arrêts
  - File: `src/services/stop-favorites-storage.ts` (NOUVEAU)
  - Action: Créer `loadFavoriteStops(): readonly FavoriteStop[]` et `saveFavoriteStops(stops: readonly FavoriteStop[]): void` et `clearFavoriteStops(): void`. Utiliser Zod schema pour valider les données : `z.array(z.object({ stopId: z.string(), stopIds: z.array(z.string()), name: z.string(), position: z.object({ lat: z.number(), lng: z.number() }) }))`. Utiliser la clé `FAVORITE_STOPS_STORAGE_KEY` depuis `config.ts`.
  - Notes: Pattern identique à `favorites-storage.ts`. Retourner `[]` si parse échoue. Gestion silencieuse des erreurs localStorage.

- [x] Task 4: Extraire la logique d'ouverture de popup stop dans un module réutilisable
  - File: `src/map/stop-popup-opener.ts` (NOUVEAU)
  - Action: Créer `openStopPopup(map: maplibregl.Map, store: Store, coordinates: [number, number], stopName: string, stopIds: readonly string[]): void`. Extraire la logique des lignes 149-189 de `stop-layer.ts` : création du `maplibregl.Popup`, appel `createStopPopupContent(stopName)`, fetch des arrivées via `Promise.all(stopIds.map(fetchStopArrivals))`, filtrage par lignes sélectionnées, rendu via `renderArrivals()`.
  - File: `src/map/stop-layer.ts`
  - Action: Remplacer le code inline du handler `click` sur `STOP_UNCLUSTERED_LAYER` (lignes 149-189) par un appel à `openStopPopup()`. Les imports internes (`createStopPopupContent`, `fetchStopArrivals`) migrent vers `stop-popup-opener.ts`.
  - Notes: C'est le pivot technique — cette fonction est utilisée par 3 endroits : clic sur map, clic résultat recherche, clic favori.

- [x] Task 5: Ajouter le bouton étoile favori dans la popup d'arrêt
  - File: `src/ui/stop-popup.ts`
  - Action: Modifier `createStopPopupContent(name, stopId, isFavorite)` pour accepter `stopId: string` et `isFavorite: boolean`. Ajouter dans le header un bouton étoile SVG (même SVGs que `favorite-icon.ts`) avec `data-stop-favorite-toggle="true"` et `data-stop-id="{stopId}"`. Le toggle utilise les classes `favorite-star` / `favorite-star--active` existantes.
  - File: `src/map/stop-popup-opener.ts`
  - Action: Après création du popup, attacher un event listener via event delegation sur le popup element pour `data-stop-favorite-toggle` clicks. Au clic : appeler `store.setState(addFavoriteStop(...))` ou `store.setState(removeFavoriteStop(stopId))` selon l'état actuel, et mettre à jour visuellement l'étoile (toggle classe `favorite-star--active` + swap SVG innerHTML).
  - Notes: On passe `store` au popup opener pour accéder à l'état des favoris. Le `stopId` utilisé pour les favoris est le premier ID du groupe (= `stop.stopId`).

- [x] Task 6: Créer la barre de recherche d'arrêts
  - File: `src/ui/search-bar.ts` (NOUVEAU)
  - Action: Créer `createSearchBar(container: HTMLElement, store: Store, map: maplibregl.Map): void`. Composants DOM :
    - Input de recherche flottant en haut de l'écran avec icône loupe SVG et bouton clear (×)
    - Dropdown de résultats en dessous de l'input (max `SEARCH_MAX_RESULTS` résultats)
    - Chaque résultat affiche le nom de l'arrêt et les lignes qui le desservent (badges colorés)
  - Logique :
    - Écouter `input` events sur le champ de recherche
    - Si texte < `SEARCH_MIN_CHARS` chars : masquer dropdown
    - Normaliser le texte (NFD, strip accents, lowercase) pour recherche accent-insensitive
    - Filtrer `store.getState().stops` par `name` normalisé avec `includes()`
    - Afficher les résultats dans le dropdown (limité à `SEARCH_MAX_RESULTS`)
    - Au clic sur un résultat : `map.flyTo({ center: [stop.position.lng, stop.position.lat], zoom: SEARCH_FLY_ZOOM })`, puis appeler `openStopPopup()`, fermer le dropdown, vider l'input
    - Fermer le dropdown au clic en dehors, ou touche Escape
  - Notes: On utilise les stops du store car ils sont déjà chargés. Le debounce n'est pas nécessaire pour un filtrage client-side synchrone sur ~800 items.

- [x] Task 7: Créer le panel de favoris arrêts
  - File: `src/ui/favorites-stops-panel.ts` (NOUVEAU)
  - Action: Créer `createFavoritesStopsPanel(container: HTMLElement, store: Store, map: maplibregl.Map): void`. Composants DOM :
    - Bouton étoile flottant en bottom-left (à côté du filter toggle, `left: 72px`)
    - Badge avec le nombre de favoris (même pattern que `filter-badge`)
    - Panel dropdown vers le haut avec la liste des arrêts favoris
    - Chaque item : nom de l'arrêt + bouton supprimer (×)
    - Message "Aucun favori" si la liste est vide
  - Logique :
    - `store.subscribe()` pour re-render quand `favoriteStops` change
    - Au clic sur un arrêt favori : `map.flyTo()` + `openStopPopup()`, fermer le panel
    - Au clic sur supprimer : `store.setState(removeFavoriteStop(stopId))`
    - Overlay pour fermer au clic en dehors (même pattern que filter panel)
  - Notes: Le panel s'ouvre vers le haut (comme un popover au-dessus du bouton) pour ne pas chevaucher le filter panel.

- [x] Task 8: Wiring dans main.ts et persistance des favoris arrêts
  - File: `src/main.ts`
  - Action:
    - Importer `createSearchBar`, `createFavoritesStopsPanel`, `loadFavoriteStops`, `saveFavoriteStops`, `setFavoriteStops`
    - Après `createFilterPanel(uiRoot, store)`, ajouter `createSearchBar(uiRoot, store, map)` et `createFavoritesStopsPanel(uiRoot, store, map)`
    - Charger les favoris arrêts au démarrage : `const storedStopFavorites = loadFavoriteStops()` → `store.setState(setFavoriteStops(storedStopFavorites))`
    - Souscrire aux changements de `favoriteStops` pour persister en localStorage (même pattern que les lignes favorites, lignes 95-101)
  - Notes: L'ordre d'initialisation importe — les stops doivent être chargés avant que la recherche soit fonctionnelle (ce qui est le cas car `loadInitialData()` charge les stops).

- [x] Task 9: Ajouter les styles CSS
  - File: `src/styles.css`
  - Action: Ajouter les styles pour :
    - **Search bar** : `.search-bar` (fixed top, centered, z-index 900), `.search-bar__input`, `.search-bar__icon`, `.search-bar__clear`, `.search-bar__results` (dropdown), `.search-bar__result` (item), `.search-bar__result-name`, `.search-bar__result-lines` (badges)
    - **Favorites button** : `.favorites-stops-toggle` (fixed bottom-left, left: 72px, même style que `.filter-toggle`), `.favorites-stops-badge`
    - **Favorites panel** : `.favorites-stops-panel` (popup vers le haut), `.favorites-stops-item`, `.favorites-stops-item__name`, `.favorites-stops-item__remove`, `.favorites-stops-empty`
    - **Popup favorite star** : `.stop-popup__header` (flex row, space-between), `.stop-popup__favorite` (star dans le header)
  - Notes: Respecter les conventions BEM-like existantes. Utiliser les mêmes couleurs (#1e293b, #3b82f6, #f59e0b pour l'étoile, etc.). Mobile-first. Touch targets 44px minimum.

- [x] Task 10: Écrire les tests unitaires
  - File: `src/__tests__/stop-favorites-storage.test.ts` (NOUVEAU)
  - Action: Tester `loadFavoriteStops`, `saveFavoriteStops`, `clearFavoriteStops`. Mocker `localStorage`. Tester : données valides, données invalides (schema fail → retourne []), localStorage indisponible, données vides.
  - File: `src/__tests__/state.test.ts` (MODIFIER)
  - Action: Ajouter tests pour `addFavoriteStop`, `removeFavoriteStop`, `setFavoriteStops`. Tester : ajout, suppression, doublon (même stopId → pas d'ajout), set complet.
  - File: `src/__tests__/stop-popup.test.ts` (NOUVEAU ou MODIFIER)
  - Action: Tester que `createStopPopupContent` génère le HTML avec le bouton étoile, que l'état favori/non-favori est correctement reflété.
  - Notes: Suivre le pattern `// @vitest-environment jsdom` en haut des fichiers testant le DOM.

### Acceptance Criteria

- [x] AC 1: Given l'app est chargée, when je tape "quorum" dans la barre de recherche, then un dropdown affiche les arrêts contenant "quorum" dans leur nom
- [x] AC 2: Given des résultats de recherche sont affichés, when je clique sur un résultat, then la map fly-to l'arrêt et la popup d'horaires s'ouvre automatiquement
- [x] AC 3: Given la barre de recherche est ouverte avec du texte, when je tape Escape ou clique en dehors, then le dropdown se ferme
- [x] AC 4: Given je suis sur la popup d'un arrêt, when je clique sur l'étoile, then l'arrêt est ajouté aux favoris et l'étoile devient remplie/dorée
- [x] AC 5: Given un arrêt est dans mes favoris, when j'ouvre la popup de cet arrêt, then l'étoile est déjà remplie/dorée
- [x] AC 6: Given j'ai des arrêts favoris, when je clique sur le bouton étoile en bas à gauche, then un panel affiche la liste de mes arrêts favoris
- [x] AC 7: Given le panel favoris est ouvert, when je clique sur un arrêt favori, then la map fly-to l'arrêt et la popup d'horaires s'ouvre
- [x] AC 8: Given le panel favoris est ouvert, when je clique sur le bouton supprimer d'un favori, then l'arrêt est retiré des favoris
- [x] AC 9: Given j'ai ajouté des arrêts favoris, when je recharge la page, then mes favoris sont toujours présents (persistés en localStorage)
- [x] AC 10: Given je cherche "cevennes" (sans accent), when les résultats s'affichent, then l'arrêt "Cévennes" apparaît (recherche accent-insensitive)
- [x] AC 11: Given aucun arrêt ne correspond à ma recherche, when je tape un texte sans correspondance, then le dropdown affiche "Aucun résultat"
- [x] AC 12: Given je n'ai aucun favori, when j'ouvre le panel favoris, then un message "Aucun favori" s'affiche

## Additional Context

### Dependencies

Aucune nouvelle dépendance requise. Tout est fait avec les outils existants (MapLibre, Zod, vanilla TS).

### Testing Strategy

**Tests unitaires (Vitest) :**
- `stop-favorites-storage.test.ts` : persistance localStorage (load, save, clear, erreurs)
- `state.test.ts` : updaters pour favoris arrêts (add, remove, set, déduplication)
- `stop-popup.test.ts` : HTML du popup avec bouton étoile

**Tests manuels :**
- Taper "quorum" → vérifier résultats → cliquer → vérifier fly-to + popup
- Ajouter un favori via la popup → vérifier qu'il apparaît dans le panel
- Recharger la page → vérifier persistance
- Tester sur mobile (touch targets, scroll, overlay)
- Tester avec accents : "cévennes" et "cevennes" doivent donner le même résultat

### Notes

- Les arrêts sont groupés par nom (`groupStopsByName`) côté backend, chaque `Stop` a un `stopIds[]` avec les IDs individuels pour les arrivées
- Le système de favoris lignes existant (`favorites-storage.ts`, `favorite-icon.ts`) sert de modèle pour les favoris arrêts
- La popup d'arrêt existante (`stop-popup.ts`) gère déjà l'affichage des arrivées groupées
- La recherche accent-insensitive est nécessaire car les noms d'arrêts TaM contiennent des accents ("Cévennes", "Château d'Ô")
- Le popup opener doit gérer le filtre par lignes sélectionnées (même comportement que le clic direct sur la map)
- **Risque** : Si les stops ne sont pas encore chargés quand l'utilisateur tape dans la recherche, la recherche retourne 0 résultats. Mitigation : désactiver/masquer l'input tant que `isLoading` est true ou que `stops.length === 0`.
- **Future** : On pourrait ajouter la recherche fuzzy (Levenshtein) si la recherche exacte s'avère insuffisante, mais c'est hors scope pour cette itération.
