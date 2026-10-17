# location — owner: P3

Sharing this phone's location with the Jam, plus the pure rules the map uses.

| File | What |
|---|---|
| `useLocationSharing.ts` | Starts only with `location_consent` + Jam `active` + member active + foreground + OS permission (asked after the map's explanation card). Broadcasts `location_update` every ~4s and `member_status` (with `RouteStatus`) on level change or every 20s; upserts `live_locations` at most every 10s or after a 10m move. Pause/resume, foreground-only via `AppState`, and adopts demo moves (an update for you that you didn't send switches you to the simulated source). |
| `routeStatus.ts` | `routeLevel(m)` / `computeRouteStatus(...)`: < 100m on route, 100–200m slightly off, > 200m deviation, > 350m significant. Distance only; scoring is P4's. |
| `presence.ts` | `presenceFor(...)`: no update for 30s = stale, 60s = offline. Labels: Live, Last updated N seconds ago, Location paused, Location unavailable, Connection lost. Staleness never means danger. |
| `throttle.ts` | Broadcast / upsert timing. |

The real `LocationService` is `src/services/location/device.ts` (expo-location `watchPositionAsync`, Balanced,
4s / 5m). The mock stays as the per-user simulated source (`setSimulatedPath` / `setSimulatedPosition`).
P4: read `RouteStatus` from `member_status` events (`routeStatus.level`); don't recompute geometry.
