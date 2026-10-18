# Fire attachment and local animal audio — regression fix

## Fire attachment
Previously fire was placed once at an upper-floor world coordinate. If a building collapsed, flames and smoke were stranded midair at the old height, with no physical geometry beneath them.

Now each active fire periodically re-evaluates its anchor against the actual stack of **supported, visible, intact floors from the foundation upwards**. Flames, smoke and their optional light all follow that anchor. If the foundation collapses, fire drops to the pile of rubble on deformed ground, rather than burning in empty air. On rebuilding, it can attach again to the standing facade. Fire engines still extinguish the active fire using the updated 3D anchor.

## Cat and dog sound range
Cat meows, purrs, panic yelps and dog barks are **heard only within 18 meters of the actual camera**, including vertical distance. The audio gate is camera-relative, not orbit-target-relative, so sounds do not travel from animals far below a high-level spectator camera. Audio volume drops smoothly inside this near zone and becomes completely silent beyond it.

The rule is enforced at three points:
1. The roaming pet simulation calls the sound engine only when the animal is in audible camera range.
2. The sound engine independently rejects distant pet effects without fetching or decoding audio files, and checks again when asynchronous decoding completes. An animal that was near when the sound started loading cannot begin barking after the camera flies away.
3. While a pet sound is playing, a rapid camera move out of range smoothly mutes it within the audio update cycle.

Other sound ranges (sirens, helicopters, explosions) are unaffected.

## QA
- `npm run test:fire-pet-audio` checks the fire changing height as upper floors and then the foundation collapse, reattachment on rebuilt floors, smoke and flame positions, near/far/vertical pet audio attenuation, no distant sample fetch, asynchronous decoding re-check and live camera-leave fade.
- Existing `npm run test:services:browser` covers burning buildings, rescue vehicles and mobile renderer.
- `npm run test:recorded:browser` verifies licensed recorded audio decodes on desktop and emulated Android.
