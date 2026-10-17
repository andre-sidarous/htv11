# Prompt 3: Maps, live location, routing, and Toronto data (Expo)

You are responsible for maps, live location, route display, group markers, route deviation, route recommendations, and civic data for **Jam**, a native mobile app built with **Expo (SDK 57) + Expo Router**, run in **Expo Go**.

Work on branch **`feature/maps-location-data`**, created from the updated `main` after the foundation merged.

## Read first (do not skip)

- Read `README.md`, `docs/architecture.md` (Location flow, Realtime), and `docs/data-model.md`.
- **Use the foundation. Do not rewrite or duplicate it.** Types: `@/lib/types` (`LocationUpdate`, `RouteStatus`, `Route`, `SupportPoint`, `RouteRecommendation`, `MemberPresence`, `MemberStatusEvent`, `LocationService`, `RoutingService`). Constants: `@/lib/constants` (`LOCATION_BROADCAST_INTERVAL_MS`, `LOCATION_DB_UPSERT_INTERVAL_MS`, `LOCATION_SIGNIFICANT_CHANGE_M`, `PRESENCE_STALE_AFTER_MS`, `PRESENCE_OFFLINE_AFTER_MS`, `ROUTE_DEVIATION_M`). Geometry: `@/lib/geo` (`haversineM`, `distanceToPolylineM`, `polylineLengthM`, already tested). Demo data: `src/lib/demo/campus-walk.json` / `campusWalk` (you own it; extend it, but keep the ids). Base map: `JamMapView`, `toMapCoord`, `regionAround` from `@/components/map/JamMapView`. Realtime: `useJamChannel` / `useJamEvent`. Theme: `@/theme`.
- **Do not** implement risk scoring, AI voice, notifications, or a demo control panel. **Register demo actions** instead. Don't rewrite auth or onboarding.
- Keep your code in `src/features/map`, `src/features/location`, `src/services/location`, and `src/services/routing`. Install native libraries only with `npx expo install` (already installed: `react-native-maps`, `expo-location`).

## Goal

When several phones open the same Jam, each shows the others on a map, updating in real time while the Jam is active.

## Map (replace the stub in `src/features/map/JamMapScreen.tsx`)

P2's Map tab renders `<JamMapScreen jamId />`. Keep that export and its props. Build on `JamMapView` (react-native-maps: Apple Maps on iOS, Google Maps on Android, no key needed in Expo Go). Show: the current user, other members, the destination, the planned route, the actual route (a breadcrumb `Polyline`), the alternative route, support points, transit stops, and a route-status card (a bottom sheet or card overlay).

Member markers: name, profile color, status, last update, activity, and health-sharing state, e.g. "Daniel — Possible concern — Running — updated 4 seconds ago". Use custom marker views (a colored circle with initials). Keep markers in state keyed by `userId` and update only the one that changed. Memoize marker components, and set `tracksViewChanges={false}` after the first render, for performance. Avoid re-rendering the whole map on every update.

Add a "Map data © OpenStreetMap / City of Toronto" attribution line wherever you show civic data.

## Live location (`src/services/location`)

Implement the real `LocationService` in `src/services/location/device.ts`, then switch `src/services/location/index.ts` to it. Keep the mock as the **simulated source** (see below).

- Start only after the member's `location_consent` is true **and** the OS permission is granted (`Location.requestForegroundPermissionsAsync()`), with a clear explanation screen first.
- Use `Location.watchPositionAsync({ accuracy: Balanced, timeInterval: 4000, distanceInterval: 5 })`.
- Broadcast a `LocationUpdate` on `jam:{jamId}` every 3 to 5s. Upsert `live_locations` (`onConflict: "jam_id,user_id"`) at most every 10s or after a move of 10m or more.
- Remove the subscription when sharing is paused, the Jam ends, the member leaves, or the app goes to the background (use `AppState`, since tracking is foreground-only). Never track before consent or after the Jam ends. RLS also rejects writes then.
- Handle permission denied, services disabled, and poor accuracy gracefully.

Status labels: Live, Last updated N seconds ago, Location paused, Location unavailable, Connection lost. Presence: no update for 30s means `stale`, 60s means `offline`/`unavailable`. **Never declare danger from staleness alone.** Subscribe to `location_update` and `member_status`; update the marker, last seen, activity, and route status.

## Demo location override

Phones can't walk across campus on stage. With the simulated source enabled for a member (`locationService.setSimulatedPath` / `setSimulatedPosition`), positions come from `campusWalk` coordinates instead of GPS. Real GPS stays the default.

The team demos with **real accounts in a live Jam**, so never hardcode the seeded user ids. Inside each action's `run`, read the target with `getDemoContext()` from `@/features/demo/demoContext`, which returns `{ jamId, affectedUserId }`. It's set by P2's Demo Mode and P5's panel, and it defaults to the seeded Campus Walk as a backup.

Demo actions run on the tapping phone (usually presenter 1's). So "move affected user away" must **broadcast** `location_update` events on `jam:{jamId}` for `affectedUserId`, along `campusWalk.affectedUserOffRoutePath`, so every phone (including the affected user's own) sees the movement. The coordinates stay the Campus Walk geography; only the ids come from the context. On the affected user's phone, when an incoming `location_update` for yourself didn't come from your own GPS, switch your `locationService` to the simulated source. That way your real GPS doesn't snap you back.

## Routing (`src/services/routing`)

Implement `RoutingService` (`getRoute`, `getAlternativeRoute`, `calculateDistanceFromRoute`) in `src/services/routing/osrm.ts`. Use OSRM at `publicEnv.osrmUrl` (e.g. `https://routing.openstreetmap.de/routed-foot/route/v1/foot/...?overview=full&geometries=geojson&alternatives=true`) with a ~4s timeout. On any failure, return `mockRoutingService`'s Campus Walk route (`source: "demo"`, `isDemoRoute: true`) and show a "Demo route" label. The app must never fail because routing is down. Use `distanceToPolylineM` for distance from the route.

## Route deviation

`< 100m` on route; `100 to 200m` slightly off; `> 200m` deviation; `> 350m` significant deviation (`ROUTE_DEVIATION_M`). Emit a `RouteStatus` inside `member_status`. Scoring belongs to P4; don't compute risk.

## Civic data

Write loaders that return `SupportPoint[]` for: Toronto Centreline, Pedestrian Network, TTC GTFS stops/routes, GTFS-Realtime or a local mock disruption feed (`campusWalk.mockDisruption`), schools, libraries, community centres, parks, public washrooms, and hospitals/police (from OSM or local GeoJSON). **Ship small, preprocessed local JSON/GeoJSON for the Campus Walk area** in `src/features/map/data/`, imported statically. Don't fetch or process full datasets at runtime. Everything must work with no external APIs.

## Support-aware route recommendation

Never label streets "safe" or "unsafe." Compute support context from: distance to support points, transit proximity, pedestrian route availability, current disruption, collision context if available, and distance to the group. Expose `getRouteRecommendation(...)` that returns `RouteRecommendation` (`{ explanation, supportPoints, alternativeRoute }`) from `src/features/map/recommendation.ts`. P5's incident screen reuses it. Example explanations:
- "This route has fewer nearby public support points and a current transit disruption. We recommend an alternative route."
- "This route keeps you closer to TTC access, a public library, and your group."

## Data sources screen

Add a route `src/app/data-sources.tsx` (a new file, so there's no conflict), linked from the map. For each dataset show: name, publisher, URL, refresh frequency, what it contributes, and its limitations. Include: "Historical safety data does not guarantee current safety and is used only as contextual information."

## Demo actions (register; don't build a panel)

In a `useEffect` inside `JamMapScreen` (or a `useMapDemoActions(jamId)` hook), call `demoActions.register(...)` with these ids from `DEMO_ACTION_IDS`, owner `"map"`: `moveAffectedUserAway`, `moveTowardDestination`, `stopLocationUpdates`, `resetLocations`, `showDisruption`, `showAlternativeRoute`, plus `triggerRouteDeviation` (P4 delegates to this one). Return the unregister functions from the effect.

## Privacy

Sharing indicator, pause sharing, stop Jam, last-updated timestamp, no location access before consent, none after the Jam ends.

## Done when

- [ ] `npm run check` and `npm run doctor` pass
- [ ] Unit tests (vitest, pure TS, no react-native imports) for deviation thresholds, the stale/offline presence logic, and recommendation text
- [ ] Tested on **two phones in Expo Go**: both see each other move live. "Move affected user away" shows deviation on both
- [ ] Works with OSRM blank and in airplane-mode-style failure (demo route label shows)
- [ ] The PR says what changed and how to test it. No secrets. No changes outside your area.
