# Living city services + pets + cleanup — 2026-10-18

This pass implements multiple cooperating city services, recorded ambience and animal voices, improved disaster debris dynamics, and permanent SHARP MOBILE mode.

## Emergency response and property-by-property reconstruction
* 2 helicopters / 1 mixer / 1 tower crane on mobile, up to 4 helicopters / 2 mixers / 2 tower cranes on desktop. Distinct workers receive separate real-world cleanup sites and carry genuine scene rubble. These units are created lazily when needed.
* Individual sites progress independently **cleanup → concrete → construction**. Mixer A can arrive after helicopter A hoists debris while helicopters B/C/D continue flying. A lot is blocked by nearby injured residents or active fires so medics/firefighters have priority.
* New fire simulation ignites facades after high-energy strikes, displays animated yellow-orange flames and plumes of dark smoke, damages exposed floors gradually, and can spread to adjacent buildings.
* Distinct red fire engines arrive, show flashing lights and a visible water jet, extinguish burning buildings, then leave.
* White ambulances with red stripes and beacons seek individual casualties; medics get out and tend to victims and return to depot. No more endlessly circling rectangular 'rescue cars'.
* On-screen city line shows counts for fires, engines, ambulances, helicopters, mixers and construction cranes.

## Animals and moving disasters
* Cats and dogs roam the city, with paws, ears, tails and separate appearance. Mobile uses 10 animals, desktop 20.
* Dogs bark, cats meow/purr; thrown animals yelp. Samples come from original **CC0 OpenGameArt** packs; new fire crackling is also a recorded CC0 sound. Sources and author credits are in `public/audio/SOURCES.json`.
* The tsunami pushes cars, free Havok fragments, floating debris, visual-only falling pieces and now uproots trees and relaunches previously settled wreckage. Tornado airflow also uproots nearby trees and throws pets.
* Physics is budgeted per device to keep mobile playable.

## World reclamation
* Out-of-city objects (|x| or |z| > city half-size + 43m; y <-65 or >240) are actually disposed from Babylon meshes and Havok bodies and removed from their arrays, rather than collecting in memory indefinitely.
* This covers rigid-body fragments, flying debris, settled visual rubble, uprooted trees, animals, vehicles and ejected ragdoll residents; dangling fracture queue references are discarded.
* Flying building floor Havok bodies can be disabled after leaving the map; minimal building records remain available for reconstruction.
* The cleanup pass runs every 0.55 simulated seconds, not every frame.

## Graphics
* Mobile rendering is **always SHARP MOBILE** at 0.84 hardware scale. The former quality toggle is removed from the UI; mobile physics and fragment visual budgets are still bounded. Desktop keeps normal graphics configuration.

## Verification
* `node tests/cityServices.test.mjs` checks tsunami/tornado pet forces, service pipeline guards, out-of-bounds Havok disposal and queue cleanup.
* `node tests/cityServicesBrowser.cjs` exercises desktop and Chrome Android emulation: cat/dog count, locked Sharp Mobile, actual fire response and ambulance dispatch.
* `npm run test:recovery:e2e` checks that actual rubble is carried by helicopter and that mixer/tower crane rebuild restored structures.
* `npm run test:recorded:browser`, `npm run test:citizen-ragdolls:browser` and all unit tests check other systems.

Visual/sound quality and full FPS need a manual real-phone pass in addition to browser emulation.
