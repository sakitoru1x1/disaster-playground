# Disaster Playground — Patches 5 + 6 + 8

## 5. Visible first responders and patient transport
- Fire engines dispatch to genuine burning lots, flash beacons, stop on the road. **Two modeled firefighters** disembark, run from their truck to the facade, aim their hose nozzle, and animate multiple translucent water droplets that visibly bridge from crew to flame. Fire heat decreases while spraying and the team returns to the depot once extinguished.
- Ambulances receive *individual patients*, drive to the scene with flashing lights, and deploy **two visible walking paramedics**. They approach the actual world location of the injured body/ragdoll, orient toward it, and stabilize the patient for several seconds.
- Minor wounds can be treated on site. More serious injuries use a detailed **portable metal-and-orange stretcher** with an occupant visibly on it. Medics carry it back to the ambulance, load the patient, and drive to a new red-cross-marked **field hospital**. The original citizen stays out of pedestrian simulation while transported; only on arrival is the patient returned to the walking population. Permanent deaths are not reversed.
- Reusable pools for crew and equipment mean no allocations for every repeated call.
- Distinct `idle → driving → deploy → approach → treat → load → evacuate → hospital → return` states make behavior visible and debuggable.
- Stretcher clanks, water spray, machinery and treatment use the existing, *actual recorded CC0 OpenGameArt* sound samples already bundled locally. No synthetic noise added.

## 6. Coordinated city rebuilding
- Each building and crater has its own claim and safety state. Existing independent crews (up to four helicopters, two concrete mixers and two 54-meter tower cranes on PC; 2/1/1 on phones) proceed **in parallel**. A mixer can begin filling one cleared crater while another helicopter is still carrying rubble offshore.
- Rescue always gets priority. If a fire ignites, or a medic enters a claimed site, unsafe local construction is interrupted. Other, safe lots keep operating. A helicopter already carrying real debris completes its safe exit rather than dumping it onto a patient.
- **Visible safety cordons** with high-contrast orange/white barriers, cones and red/white warning areas mark the worksite. Prefabricated panels and two walking/working high-visibility builders appear by an erecting tower crane.
- Worksite meshes are *pooled*, with maximum **three simultaneous dressed lots on mobile and six on desktop**; props are hidden and reused, not leaked, when construction finishes or must pause.
- Recovery debug status now reports activity across *all parallel workers* instead of hiding helicopter winches while a crane is visible. `getRecovery().activeUnitPhases` and `getRecovery().workzones` expose actual job progress.

## 8. Graphics, particle effects and optimization
- Building fires now use taller **tapered orange flame geometry**, pulsating hot cores, drifting semi-transparent grey smoke and floating emissive embers. Fire intensity responds to suppression; translucent embers are lifetime-pooled.
- Mobile limits each fire to **three embers**, desktop to seven. When camera is distant, side flames, smoke layers, embers and local dynamic lights are hidden while fire physics and heat are still simulated correctly; distance checks are throttled to avoid needless visual updates.
- Firefighter streams render water droplets in 3D, not a static floating tube. Stretcher, emergency uniforms, crash responders, reflective signs and construction safety items remain visible even on Sharp Mobile.
- Physics cleanup from prior versions remains active: out-of-world meshes and Havok bodies are destroyed, cleanup cargo is detached and flown to the dump, and rubble is batched under load.
- 3D fire continues to track supported facades or ground-level wreckage, so buildings do not burn in midair.

## Test commands
- `npm run test:coordination`: patient triage, response phases, medic/fire safety blocking, worksite barrier pooling and visible workers.
- `npm run test:dispatch:e2e`: launches real Chrome on desktop and emulated Android; requires firefighters, visible hose/water, walking paramedics, loaded stretcher occupants, ambulance departure for the field hospital.
- `npm run test:recovery:e2e`: watches *all simultaneous* helicopters, mixers and cranes, verifies physically attached rubble rising, concreted craters, and rebuilt original structural floors.
- `npm run test:services:browser`: ensures emergency vehicles successfully extinguish actual 3D building fires.
- `npm run test:fire-pet-audio`: physical support anchoring and exact-radius local animal sounds.
- `npm run build` + baseline city/physics/survival tests.
- Headless software WebGL tests demonstrate behavior, but **do not certify real phone FPS** or replace reviewing sound/visual feel on hardware.
