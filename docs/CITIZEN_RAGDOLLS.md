# Living casualties, readable rescue signs and real disaster ragdolls

## What changed
- Replaced faulty textured HELP billboard planes, which appeared as black
  rectangles on Chrome Android / WebGL, with high-contrast amber-and-white
  screen-space rescue indicators. They follow the injured resident or their
  physical ragdoll, are camera-projected, and have mobile screen-space limits.
- Strong tornado winds give civilians 3D airflow: radial suction, rotation and
  uplift; a moving tsunami front pushes them in its sweeping direction along
  **the entire Z-axis**, not only near the street center. A citizen already
  injured continues to react to later disasters rather than being frozen.
- Up to **six articulated six-body Havok ragdolls on mobile** or **15 on PC**
  exist simultaneously for affected citizens. Extra casualties use flying,
  tumbling six-limb animated avatars to prevent mobile physics slowdown.
- The physical ragdoll keeps the citizen's jacket color and interacts with
  terrain. Once the wind/wave subsides and the body lands, the resident
  remains down and can be helped. Emergency medics target the ragdoll's
  actual location; pressing HELP near the final body makes them get up.
- Disaster deployment **does not immediately injure or teleport people at
  the clicked point**. Actual passing meteor shockwaves, moving funnels and
  the tsunami front now determine when each citizen reacts.
- Reconstructed/new citizens and rescue markers never reuse or resurrect
  physically deceased residents.

## Performance / behavior
- The expensive articulated Havok bodies have a strict scene-wide budget,
  and the overflow lightweight fallback also reacts to the wind and water.
- Dynamic SOS labels pool at most 6 mobile / 12 desktop HTML elements; zero
  3D sign planes, no WebGL dynamic-texture materials or black rectangles.
- Ragdolls and ballistic figures settle after the disaster and are disposed
  when the victim is rescued or replaced. Standard commuters remain
  low-cost instanced animated people.

## Verification
- `npm run test:citizen-ragdolls`: force direction, cyclone uplift,
  whole-city tsunami sweep, floating avatar and recoverable settlement.
- `npm run test:citizen-ragdolls:browser`: Chrome desktop + Android
  emulation, verifies exposed victims convert into real Havok ragdolls or
  animated overflow, body rises and changes location, SOS geometry is
  completely removed, and two different event types can affect victims.
- Existing city, rescue, routine and disaster physics tests must remain green.

Do a real-phone smoke test with strong tornado and tsunami near city residents
to verify the visual feel; headless graphics tests cannot replace that.
