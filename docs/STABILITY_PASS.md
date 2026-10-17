# Stability/Regression Pass — Disaster Playground

Date: 2026-10-17
Scope: existing features only; no new city systems or content.

## Defects found and fixed
1. **Outer-city earthquake immunity.** Quake targeting considered only the
   original 22 central buildings. It now includes all peripheral modular
   buildings, keeps its damage falloff nonnegative and spans the 312m island.
2. **Disasters snapping back to the old map.** Tornado drift was hard-clamped
   to +/-70m. Ground fissures were clamped to +/-78m and tsunami spray only
   ranged +/-73m. All now use the shared 312m island dimensions.
3. **Cars impervious to tornado/tsunami physics.** Animated traffic actors
   ignored wind velocity and water impulses. When winds or strong water
   reach a driver, the vehicle is released to a dynamic Havok body first.
4. **Broken conversations.** A citizen's temporary 'socializing' state was
   cleared by the work schedule on the next tick, so greetings lasted almost
   no time. Schedule activity and temporary social activity are now separate.
5. **Weak performance while damaging distant buildings.** A small scratch
   converted all floors of an outer building to separate static Havok bodies.
   Buildings keep their one-collider proxy until actual structural failure.
6. **Incorrect integrity HUD.** The former gauge counted only collapsed
   floors and could still show 100% when every intact storey had low health.
   It now reflects normalized structural health, counting destroyed floors
   as zero. Regeneration restores the displayed integrity gradually.

## Regression matrix
- Build: `npm run build`.
- Twelve unit suites: `npm run test:survival`, `test:fracture`, `test:city`,
  `test:graphics`, `test:evolution`, `test:terrain`, `test:expansion`,
  `test:districts`, `test:horizon`, `test:citizens`, `test:behavior`,
  `test:disasters`.
- `npm run test:browser`: starts a local Vite server, launches Chrome
  Playwright with desktop and Pixel 7 viewports, asserts spawn, 100%
  starting integrity, visible citizen instances, multiple disaster
  deployments, reset/rebuild and no JS exceptions.
- Deterministic population simulation covers 360 seconds (three full
  city days), commuting to work, returning home, maximum per-frame
  displacement, greeting duration, injury immobility, and panic recovery.
- Disaster unit simulation checks outer earthquake building lists,
  peripheral tornado position, animated-to-dynamic traffic release,
  water forces, and damage limits.

## Limitations
- Headless Chrome uses software WebGL (~1–2 FPS on the test computer)
  and is useful for error/crash detection, **not** a real performance
  benchmark. Measure FPS on actual mobile and GPU hardware before
  considering a feature/performance target met.
- Scenarios have automated coverage, but this is not proof that every
  possible emergent Havok collision has been exercised.
