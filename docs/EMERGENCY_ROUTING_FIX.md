# Regression fix — Emergency routes, helicopter job discovery, crane eligibility

Reported from three real Android screenshots:

1. Ambulances and fire trucks appear parked offshore while help markers remain in town.
2. Rubble remains even though no cleanup helicopters appear.
3. Large tower crane appears next to an apparently intact building.

## Root causes and fixes

### Emergency vehicles
- **Critical logic defect:** `EmergencyDispatch.deploy()` assigned a route and then called `phase('driving')`; the generic phase setter immediately zeroed the route. The very next `drive()` call reported 'arrived' without moving, leaving every vehicle at its offshore depot, then firefighters/paramedics tried to walk to casualties across the water.
- `phase()` now preserves routes when starting `driving`, `return`, and `evacuate`, but clears old routes when changing to a non-driving action.
- Dispatch depots now lie on the real -117m road lattice inside the playable island; responder routes stop at an actual roadside grid coordinate rather than driving off-road towards a building's center or offshore. Emergency crews walk the last few metres.
- The field clinic and recovered patients now also occupy in-city positions; equipment returns via in-bounds roads.

### Cleanup helicopters
- Previously `ParallelRecovery.gather()` only called `recoverySite()` for the first few pieces of loose rubble, frequently re-scanning the same district. The loop bound even shrank as discovered site count grew. Remote rubble could remain undiscovered, so no helicopter received a job.
- Now the dispatcher scans actual **physics debris, fragments, settled rubble and visual fragments throughout the city** into geographically distinct 18m clusters and assigns them as independent recoverable lots.
- A helicopter starts above an in-city heliport/launch edge instead of spawning offshore. It still physically lifts original pieces and transports them out to the off-shore disposal zone.
- Helicopter cleanup on a safe property may happen concurrently with paramedics/firefighters working on another property. **A site containing injured people or active flames still blocks heavy lifting until responders clear it.**

### Tower crane
- The old `damaged` rule treated any loss of hit points (even small invisible cosmetic chips) as requiring a massive tower crane.
- Now **only physically detached/collapsed floors** (`floor.active===true`) qualify for a tower crane. Cosmetic HP damage is not a construction task. The actual crane floor selector also refuses intact storeys.
- Other worksite guard rails, cones, concrete trucks and independent building repairs remain functional.

## Tests

- `node tests/emergencyRoutes.test.mjs` ensures all emergency routes stay on-road, within city boundaries, and end near their patients; verifies no crane is assigned for merely chipped facades.
- `node tests/emergencyRoutesBrowser.cjs` plays a real wreck+victim+separate-debris scenario in desktop and emulated Android Chromium. Asserts vehicles drive from their depots into the city, medics approach the incident, helicopters lift real attached wreckage while responders remain at work, patients enter ambulances, no offshore responders, and no crane appears at intact houses.
- `npm run test:dispatch:e2e` checks full visible triage + hospital, firefighters, hoses, stretcher.
- `npm run test:recovery:e2e` checks helicopter lifting, concrete pouring and real floor reconstruction.
- `npm run test:browser`, `npm run test:services:browser`, `npm run build` regression coverage.

Tests use Chromium software GL / simulated time and do not claim actual phone FPS or touch performance.
