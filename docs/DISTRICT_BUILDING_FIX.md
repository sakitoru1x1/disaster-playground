# District building structural fix — October 17, 2026

The expanded-city architecture introduced in pass 1 had decorative monolithic
"district shell" blocks. They were **not** part of `world.structures` and thus
escaped the meteor's swept roof collision. Their disaster reaction simply
scaled the whole block to 16% of its height or tipped it over.

## Replacement: proper modular buildings

- The same 67 outer-city structures on desktop (density unchanged).
- District-specific apartments, townhouses, factories, warehouses, hotels,
  glass towers, offices, docks and other recognizable architecture.
- 371 independent structural floors across those 67 buildings, including
  separate roof features, windows, entrances, balconies and facade trim.
- Every floor is registered in `world.structures`, has section health and can
  fracture into physical slabs and facade debris using the existing mechanic.
- `findBuildingAt()` resolves these buildings, so orbit-camera targeting
  correctly aims at the roof. Meteor sweeps now test their physical AABBs.
- Falling upper floors are queued after a supporting floor breaks; there is
  no whole-building shrink/tilt or fake one-block collapse.
- All decorative architecture is parented to its floor and disappears on
  rupture, preventing floating window and roof details.
- Normal intact structures use **one hidden Havok collider each**; the first
  damage replaces that collider with Havok colliders on the individual still-
  standing floors, saving hundreds of idle rigid bodies.
- The player, foundation erosion, earthquake, tornado, meteor, tsunami,
  rebuilding and structural integrity all use these actual floor entries.

## Regression

- `npm run test:districts`: distinct architecture and multiple levels,
  side/roof meteor collision, exact overhead targeting, hitting the next
  intact floor after the roof is gone.
- All existing city, terrain, survival, fracture, graphics and evolution tests.
- Browser smoke with Chrome/Babylon/Havok: 67 district buildings / 371 floors;
  a direct test impact activated floor colliders, removed the original whole-
  building proxy and broke only the struck floors (not the full block).
- Software-rendered browser FPS is low (~1 FPS); real-GPU performance must be
  measured separately before raising city complexity further.
