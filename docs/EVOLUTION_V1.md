# Disaster Playground — Evolution v1

Scope: five gameplay systems delivered locally, built on existing Babylon.js + Havok.

## 9. Destructible terrain
- An editable 48×48-division terrain mesh replaces the original flat ground collision box.
- Static Havok **MESH** collision is rebuilt after crater formation, so a player can fall into depressions rather than walking on an invisible flat collider.
- Meteor impacts leave radius/depth-scaled depressions with ejecta rims. Strong earthquakes also deform terrain and produce pavement cracks.
- Road geometry is bent to follow ground deformation. Foundations directly affected by a crater take structural damage; the existing building-cascade logic handles falling storeys.
- Crater impacts accumulate (up to seven tracked). The old island collision roof is removed and decorative bedrock placed below the depression range.
- Limitation: grid terrain and procedurally warped asphalt, **not** voxel excavation or liquid physics. Individual pavement meshes are not separate Havok fracture bodies.

## 2. Physical ragdoll
- A strong knockdown or fatal hit converts the first-person collision capsule into a **six-part articulated Havok rig**: head, chest, left/right arms and left/right legs.
- Five ball-and-socket constraints permit physical twisting and collisions.
- The camera pulls behind the moving body on incapacitation. Survivors recover to the capsule after ~1.6 seconds; dead players remain fallen until RESPAWN.
- Leaving WALK and RESET dispose all ragdoll Havok bodies and mesh resources. Mobile uses the same physics rig, but only for injured/incapacitated moments.
- Limitation: walking still uses the optimized capsule, not always-on animated skeletal locomotion. No climbing or limb-by-limb injury yet.

## 4. Smarter civilians
- Pedestrians flee hazards, crouch/shelter during moderately dangerous events, and can be injured rather than instantly removed from the city.
- Injury state stops movement and is treatable; sufficiently severe exposure can still be fatal.
- Rescuers have assigned targets. Normal pedestrians resume movement when helped.
- The player can press **E** next to an injured person on desktop or tap **HELP** on touch devices in WALK mode.

## 6. Rescue services
- Emergency ambulances and fire units are spawned with animated Havok road collisions **after** active waves recede.
- They circulate on the existing road system, and are released into dynamic Havok if another catastrophe hits.
- Up to six rescue vehicles can be dispatched over several emergencies.
- Existing NPCs can become medics, approach nearby casualties and treat them (~1.8 simulated seconds at close range).
- Rescued counter appears on mobile HUD. Death is permanent for a victim; medics treat only injured NPCs.
- Limitation: emergency routes are city patrol loops, not advanced obstacle-aware dispatch; no firefighting hose or stretchers yet.

## 7. City that develops
- 120-second simulated day/night lighting cycle, with visible day counter.
- When there is no disaster, the city adds a new physical building on an unoccupied original lot every ~75 simulated seconds after the first minute, up to 22 unoverlapped plots.
- After 17 quiet simulated seconds, fallen storeys begin to rebuild individually, starting at the foundation (approx. one per 3.5s desktop / 5.5s mobile). Settled rubble is cleared in small local batches.
- All restored floors regain static Havok bodies, health and facade details. The reconstruction uses existing structure objects instead of regenerating/teleporting the entire city.
- Limitation: evolution lasts for the **current game session**, does not persist across browser reload or RESET yet. Additional suburban lots after 22 buildings require future road layout expansion.

## Validation
- `npm run test:evolution`: terrain height profile, mild shelter, strong injury, medic treatment, manual rescue and new construction.
- Existing `npm run test:city`, `npm run test:survival`, `npm run test:fracture`, `npm run test:graphics`, and `npm run build`.
- Browser smoke checks (Chrome, phone-emulation and PC): Havok ragdoll creation and cleanup, terrain deformation + earthquake damage, pending emergency dispatch, rebuilding a real Havok floor and city expansion, RESET.
- Graphics and heavy destruction still need **real hardware** FPS verification; headless software-rendering FPS is not representative.
