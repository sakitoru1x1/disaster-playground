# Autonomous City Recovery Convoy

This update replaces the old invisible auto-repair of one floor every few
seconds with an animated, ordered recovery service. Each new disaster restarts
the cleanup planning.

## 1 — Heavy-lift helicopter
When the impact waves have stopped, the bright yellow helicopter flies from
offshore and hovers **over the actual centroid of the ruins**, avoiding the
highest still-standing floors. The helicopter lowers a cable and open safety
net to rubble level. The original broken concrete and other debris meshes
remain visible and are physically lifted into the net, then climb back with
the winch. The loaded helicopter flies across town and off the island, only
unloading when it reaches its offshore dumping area. It returns for the next
house and searches the streets for leftover rubble after ruined properties.
There is no substitute cargo cube or instant deletion when the helicopter
arrives; payload is carried by the real former debris geometry.

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
Once the last crater is filled, a flatbed materials truck approaches a building
while a **54-metre stationary lattice tower crane** visibly erects beside the
site. Its 47-metre horizontal braced jib, counterweights, operator cab,
slewing platform, moving trolley, winding steel hoist cable, hook and
suspended concrete pallet actively position precast floor elements over
the damaged structure. Genuine original structural meshes and Havok static
bodies are restored **bottom-to-top**, one floor at a time. The tower crane
is repositioned and reassembled at the next lot after each building.

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
  two different buildings and make two craters. Assert helicopter hovers
  directly over rubble, captures actual debris meshes and lifts them,
  the 54-metre lattice tower crane fully erects and operates its 47-metre
  jib/trolley, and the mixer/truck rebuild everything to full integrity.
- Existing survival, city, district, terrain, citizens, earthquakes and
  browser mobile/desktop smoke suites remain mandatory.

**Performance caveat:** the headless software-rendered browser is only a
correctness test. Actual visual fluidity must still be checked on a phone.
