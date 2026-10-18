# Audio Pass / Living City Soundscape

## What you hear
**Original adaptive background music:** a procedural cinematic urban score using
sustained analog-style chords, bass, arpeggiated melody and darker synth timbres
during disasters. Tracks are scheduled ahead on the WebAudio clock and adapt
to structural damage/ongoing danger. Music continues quietly while paused.

**Daily city:** traffic engine idles and revs (the four nearest vehicles on PC,
two on mobile), congested horns, breeze, ocean surf, distant street crowds,
daytime birdsong, and emergency vehicle sirens. Vehicle pitch varies with the
actual traffic speed. Audio pans *relative to camera heading*; a car passing
behind you no longer stays locked to a fixed stereo side.

**Destruction:** approaching meteors, impacts, blast rumble, tornado roar,
earthquake tremors, tsunami surge, masonry cracks, glass-like shattering,
building collapses, slab impact and rubble landing. A voice budget, per-effect
cooldowns and distance attenuation prevent hundreds of overlapping booms.

**First-person survival:** normal and sprinting footsteps matched to the
player's grounded movement, hurt/impact reactions, death, respawn and helping
injured people.

**People / driving:** NPC greetings and murmurs, panic shouts and injuries,
car crashes, traffic jam horns, rescue alarms and medical treatment chimes.

**Animated reconstruction:** rotor whine on helicopter arrival, continuous
positioned helicopter engine and rotary blades, winch, cargo metal clank,
hoisting and hauling rubble, cement mixer engine and rotating drum, pouring
concrete, materials truck, tower crane mechanical slewing and hoist, new floor
placement and finished-building chime. These loops follow the actual 3D
vehicle and machine positions and mute when their machines stop working.

**UI:** tool selection, launch confirmation, pause/resume, camera/mode changes,
survivor rescue/respawn, game reset and sound control.

## Playback and controls
- Sound starts only after the **first actual tap or keyboard key press**,
  satisfying browser restrictions on WebAudio autoplay (iOS/Android included).
- Header has SOUND ON / MUTED. On small phones SOUND is inside the new
  always-visible ♫ MIX audio panel.
- ♫ MIX sliders independently control music, effects and ambience.
- Mute changes the master gain smoothly, without creating new contexts.
- One persistent audio engine survives scene rebuild; audio objects are cleaned
  up on page unload.
- All sound samples and the music score are **procedurally synthesized in
  JavaScript**. No copyrighted audio files, audio downloads or network service
  dependencies. Individual samples are cached, not regenerated per impact.

## Performance
- Audio frame recalculates every ~110 ms, rather than per rendering frame.
- One context, 14-16 continuously reusable sample loops, short cached sound
  buffers, at most 13/22 concurrent one-shot voices (mobile/desktop).
- 3D proximity attenuation and scene listener are used in both orbit and
  street-level camera modes.
- Audio synthesis is cheaper than decoding dozens of external sound files,
  but **real-device FPS and mix quality still require listening tests**.

## Tests
- `npm run test:audio`: gain falloff, paused/muted mix, recovery stage mix,
  simulated AudioContext graph, cache, music scheduler, voice budget and
  scene reset without loop duplication.
- `npm run test:audio:browser`: starts Vite and uses Chrome on desktop and
  mobile layouts; confirms no autoplay, unlock on real click, notes/loops
  started, volume sliders, mute/unmute, sound effects, reset and no JS errors.
- `npm run build` and existing physics/city/disaster/recovery/survival tests
  cover regression of features that now trigger sounds.

**Caveat:** procedural timbres are an initial designed sound set, not
professional recordings of individual brands of motors or natural sound.
