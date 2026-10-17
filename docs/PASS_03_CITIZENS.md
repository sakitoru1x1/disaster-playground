# Pass 03 / 10 — Living population (patches 07–09)

**Population**: 210 independently simulated citizens on desktop, 72 on mobile.
Unlike the previous 40–55 randomly roaming pedestrians, these NPCs have a
persistent daily identity and places to go.

## Patch 07: jobs, homes and destinations
- Each citizen owns a deterministic identity, occupation, home, work and
  leisure waypoint in the city's existing 20×20 sidewalk network.
- Roles: office, factory, retail, delivery, health and harbor staff.
- Local journeys chosen within four grid steps of home; 120-second day clock.
- Free movement between footpath nodes without teleporting; shortest Manhattan
  route selected on the shared sidewalk graph, avoiding dead-end loops.
- Commuting → work → park/shopping/meeting/leisure → home → rest; staggered
  shifts prevent everybody leaving together.

## Patch 08: street interactions
- Residents wait at their destinations instead of wandering without purpose.
- Idle head movement, waving hands and leg animation. Nearby idle neighbors
  greet and converse briefly, with cooldowns.
- Existing disaster logic still overrides schedules: citizens flee, shelter,
  get injured and can be treated by rescue medics. After danger clears,
  surviving citizens resume their daily itinerary.

## Patch 09: performance and regression safety
- Shared instanced torso/limbs/head sources instead of one unique box mesh
  for every body part; 210 NPCs use 1,260 geometric instances rather than
  1,260 separate geometry definitions.
- Walking camera distance-culls citizens outside 68 m (mobile) or 110 m
  (desktop) while their simulation and disaster reactions continue.
- All population, social and time-of-day actions use simple CPU math; no new
  Havok collision bodies are created for residents.
- Performance on a real phone needs on-device verification; the headless
  software-rendered desktop browser is not a useful FPS benchmark.

## QA
- `npm run test:citizens` checks 220 deterministic identities, six jobs,
  home/work/leisure paths, all phases, safety bounds, and shortest routes.
- All existing builds and tests retained.
- Live Chrome + Havok smoke confirmed 210 simulated NPCs with 1,224 body-part
  instances active in the initial camera view, visibly changing coordinates
  as they commute. No JS exceptions.
- `window.disasterDebug.getCitizenDebug()` exposes routine, activity, and
  rendering metrics for future performance/regression checks.
