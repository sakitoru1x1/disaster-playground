# Autonomous City Recovery Convoy

This update replaces the old invisible auto-repair of one floor every few
seconds with an animated, ordered recovery service. Each new disaster restarts
the cleanup planning.

## 1 — Heavy-lift helicopter
When the impact waves have stopped, the bright yellow helicopter arrives from
offshore and hovers over the most heavily damaged property. Its cargo net is
lowered and the wreckage of **one entire building lot** is removed in one pass.
The helicopter then raises the loaded net and moves to the next wreck.
The system also searches for stray road/park debris after the ruined buildings.

Cleanup includes dynamic Havok fragments, settled rubble, baked rubble groups,
visual falling pieces, and dynamic impact debris. Physics aggregates and
secondary-fracture queue references are disposed, so removed wreckage cannot
reappear in a later frame.

## 2 — Cement mixer
Once all building lots and loose debris have been processed, a mixer drives to
each remaining crater in turn. Its drum rotates, concrete is poured through a
visible chute and an expanding fresh-concrete patch fills the crater.

The ground is rebuilt from its underlying height function and the **same**
geometric road, sidewalk, painted-line and park meshes. Havok's terrain
collision mesh is rebuilt. Subsequent meteors destroy overlapping concrete
patches to prevent the old floating-road bug.

## 3 — Truck + mobile crane
Once the last crater is filled, a mobile crane and materials truck approach
each damaged building. Floor prefabs are lifted and genuine original structural
floor meshes and Havok static bodies are restored **bottom-to-top**, one floor
at a time. Health, fracture state and damage decals reset. The next building
starts only when the previous is complete.

Reconstructed buildings attract new residents if the city lost people in the
disaster. These have new identities; deceased NPCs are not resurrected.

## Other behavior
- All machines are rendered in 3D and are controlled by a separate low-cost
  animation system, not 100s of additional Havok bodies.
- New disasters cancel active construction and restart cleanup when safe.
- Strong earthquakes can have deferred collapses: cleanup waits up to 24 game
  seconds before starting, while actual building restoration waits for all
  structural failures to settle.
- Recovery counters and the current phase appear in
  `window.disasterDebug.getRecovery()`. The HUD displays HELI, MIXER, or CRANE.
- The normal rescue/ambulance service still runs independently.

## QA
- `node tests/cityRecovery.test.mjs`: one-flight grouped cleanup,
  rubble merge disposal, Havok body reclamation, distant debris, reset.
- `node tests/returningResidents.test.mjs`: new arrivals, capacity caps,
  deceased citizen replacement without identity resurrection.
- `node tests/recoveryIntegration.cjs`: Chrome + Havok end-to-end: break
  a real building, create crater, fly helicopter, pour concrete, animate
  crane/truck, rebuild floors, assert zero craters and full integrity.
- Existing survival, city, district, terrain, citizens, earthquakes and
  browser mobile/desktop smoke suites remain mandatory.

**Performance caveat:** the headless software-rendered browser is only a
correctness test. Actual visual fluidity must still be checked on a phone.
