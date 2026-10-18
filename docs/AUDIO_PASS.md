# Audio Pass / Living City Soundscape

## What you hear
**Airy, restrained original score:** instead of continuously layered chords,
bass and arpeggios, the soundtrack now gives each two-note chord six seconds
of space. A melody enters only occasionally, with long quiet gaps. Severe
destruction fades the music down so explosions stand out instead of competing.
Music decays gently when paused.

**Natural quiet:** a light distant city hum sits under the main action; birds
chirp briefly with 8–19-second intervals, the ocean is heard mainly near the
coast, and a crowd is only audible around living nearby residents. Regular
wind is almost silent unless there's a storm. Only the closest **two cars
on desktop / one on mobile** get individual engine loops; vehicle pitch reacts
to traffic speed and engine sounds follow camera-relative stereo position.
No constant stack of traffic, surf, birds, wind and crowd noise.

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
- One context. Loops are **created lazily** only when actually audible,
  typically 3–5 active city sources instead of 14–16 prestarted layers.
  Original loops now synthesize mainly pitched motor/rotor tones with little
  filtered air noise (not broadband white noise), and use per-source gentle
  low-pass filters. Individual samples are cached and reusable.
- Dedicated **motor bus**, ambient bus, music bus and effects bus. Loud impacts
  automatically duck the backgrounds and overlapping clattering sounds use
  shared cooldowns. Maximum 7/11 concurrent one-shot voices (mobile/PC).
- 3D proximity attenuation and scene listener are used in both orbit and
  street-level camera modes.
- Audio synthesis is cheaper than decoding dozens of external sound files,
  but **real-device FPS and mix quality still require listening tests**.

## Tests
- `npm run test:audio`: low-noise synthesized PCM RMS, reduced idle mix,
  spatial gain, shared impact-priority cooldowns, sparse loop allocation,
  motor-bus isolation, music scheduling, mute/sliders and no reset leaks.
- `npm run test:audio:browser`: starts Vite and uses Chrome on desktop and
  mobile layouts; confirms no autoplay, unlock on real click, notes/loops
  started, volume sliders, mute/unmute, sound effects, reset and no JS errors.
- `npm run build` and existing physics/city/disaster/recovery/survival tests
  cover regression of features that now trigger sounds.

**Caveat:** procedural timbres are an initial designed sound set, not
professional recordings of individual brands of motors or natural sound.
