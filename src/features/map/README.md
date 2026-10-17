# map — owner: P3

The Map tab (`<JamMapScreen jamId />`) on `@/components/map/JamMapView`: you, other members (live over
`jam:{jamId}`), the destination, the planned route, each member's breadcrumb trail, the alternative route,
support points, TTC lines/stops, and a route-status card. Tap a member for details
("Daniel — Possible concern — Running — updated 4 seconds ago").

| File | What |
|---|---|
| `JamMapScreen.tsx` | The screen. Keep the export and props. |
| `useJamMapData.ts` | Jam, members (+ consents, names via `member_profiles`), `live_locations`, open alerts, routes. Campus Walk in mock mode. |
| `memberStore.ts` | Per-member live state; markers subscribe to one member each, so one update re-renders one marker. |
| `recommendation.ts` | `getRouteRecommendation(input?)` → `RouteRecommendation`. |
| `civicData.ts` + `data/*.json` | Toronto civic data loaders (`SupportPoint[]`), imported statically. |
| `dataSources.ts`, `DataSourcesScreen.tsx` | The `/data-sources` screen. |
| `useMapDemoActions.ts` | P3's demo actions. |
| `mapUiStore.ts` | Show disruption / alternative route toggles. |

## For P5: route recommendation

```ts
import { getRouteRecommendation } from "@/features/map/recommendation";
const { explanation, supportPoints, alternativeRoute } = getRouteRecommendation();
// With no arguments it uses the Campus Walk routes + the demo disruption:
// "This route has fewer nearby public support points and a current transit disruption. We recommend an alternative route."
```

Pass `route`, `alternativeRoute`, `disruption` (`loadTransitDisruption()` or `null`), `groupPositions`, and
`userPosition` for a live Jam. It describes support context only; it never labels streets safe or unsafe.

## For P4: spoken guidance

```ts
import { getSpokenGuidance } from "@/features/map/guidance";
const { guidance, nearestSupportPoint } = getSpokenGuidance({ position, route, destination, supportPoints });
// "Head north on St. George Street for about 300 metres, toward Robarts Library."
```

Pure and deterministic. Within 200m of the route it looks ~100m ahead for the direction and says how far the
route keeps going that way (max 300m). More than 200m off, it guides back to the route or to the nearest public
support point if that's closer. `route: null` points straight at the destination. `supportPoints` defaults to
the bundled Toronto data; landmarks prefer libraries, TTC stations, community centres, hospitals, police, and
washrooms. Put `nearestSupportPoint` in `AiCallContext.nearestSupportPoint`.

## Demo actions (owner `"map"`)

Registered while the map is mounted. Each reads `getDemoContext()` at run time and broadcasts on that Jam's channel:
`moveAffectedUserAway`, `triggerRouteDeviation` (P4 delegates here), `moveTowardDestination`,
`stopLocationUpdates`, `resetLocations`, `showDisruption`, `showAlternativeRoute`.
Show disruption / alternative route change the map on the tapping phone only (there's no broadcast event for them).

## Civic data

Small extracts for the Campus Walk area (UofT St. George), from the City of Toronto Open Data Portal (TTC GTFS,
libraries, parks & recreation, washrooms, schools, police, pedestrian network, centreline) plus OpenStreetMap
hospitals. Nothing is fetched at runtime. To regenerate (needs network, Node 20+, `unzip`; downloads ~170 MB
into the cache dir you pass, which should be outside the repo):

```bash
node src/features/map/data/extract/extract-toronto.mjs /path/to/cache
```
