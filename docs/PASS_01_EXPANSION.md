# Pass 01 / 10 — Expanded city (patches 01–03)

## Patch 01 — Expanded world
- Mainland now 312 × 312 world metres versus the old 172 × 172: **3.29× the playable land area**.
- Unified 11 × 11 blocks and 10 avenues on each axis.
- Coastal geometry, water effects, crater ground physics, first-person limits, camera, tsunami sweep, player drowning range and targeting now use shared dimensions.

## Patch 02 — Districts and roads
- Downtown, residential, industrial, harbor and uptown zones with plot-specific building profiles.
- 9 parks, shoreline piers, all 121 sidewalks and 100 connected traffic circuits.
- Main destructible buildings are interleaved across all five zones; future construction reserves slots.
- 20 × 20 pedestrian path nodes and vehicles distributed across the whole map.
- Single-body skyline shells fill unused peripheral lots (lower density on mobile). Shells have physical colliders and react to disasters.

## Patch 03 — Performance and regression safety
- Peripheral scenery uses one Havok collider per building instead of a physics collider per floor.
- Destruction caps the number of simultaneously dynamic distant skyline shells.
- Roads, pavement, paint and parks remain **four material-batched deformable skins**; distant pavement is tessellated less densely.
- Craters excavate road paint, lawns, asphalt and sidewalks across the expanded terrain.
- Enlarged ground collision mesh uses moderate subdivisions rather than scaling subdivisions linearly.
- Dynamic downtown building count remains at 1–30 to preserve existing structural fracture budgets.

## Verification
- `npm run build`
- `npm run test:expansion`
- `npm run test:city`
- `npm run test:terrain`
- Existing survival, graphics, fracture and progression tests.
- Headless Chrome smoke: game launches, exposes debug state, renders 312 m city without console exceptions.
