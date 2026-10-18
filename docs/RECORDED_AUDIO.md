# Disaster Playground — recorded audio pass

**Replaces the entire disliked procedural audio patch.** All background music and sounds now come from **actual CC0 WAV/OGG/MP3 assets downloaded through Chrome** from OpenGameArt. No generated WebAudio samples, no random white-noise synthesis, no external streaming services. Included audio files are served from `public/audio/` and work without an internet connection to the sound libraries once the game has loaded.

## In game
- **Real recorded music:** "Calm Loop" (wipics) during city life and "Project Utopia" (congusbongus) during disasters. Crossfaded, low volume.
- **Traffic:** moving cars use car-engine recordings with mild pitch variation based on speed; only the closest 1–2 cars are audible at once. A very quiet city/highway recording anchors the street view.
- **Rescue:** helicopter has a recorded propeller loop tied to its flying position and a real flyby sound when dispatched. Construction crane, cement mixer, pour, truck and winch use machine/construction/water/metal samples triggered by the recovery state.
- **Destruction:** meteor air whoosh, multiple real explosion variants, glass shattering, concrete cracks, falling stone and rubble, thunder during earthquakes, wind/waves during tornado/tsunami.
- **Movement and game UI:** dry/wet footfalls and interaction samples, car impacts, injured NPCs, treatment, construction completion, menu selection.
- **Atmospheric room:** sparse highway/city background (low in orbit), subdued musical ambient, with no continuous five-layer broadband noise.
- **Positional mixing:** sounds attenuate with distance; stereo pan rotates with camera. Mute available on desktop and mobile topbar.
- **Web audio** starts only after the first real user gesture (browser autoplay restriction). 7–12 one-shot voices maximum, shared rubble cooldown, dynamic/reusable samples and loops, no sample synthesis or downloading during every hit.

## Verified sources and licensing
All **37 included files are CC0/public domain** according to the cited asset listing pages. Precise file-by-file source and artist are recorded in `public/audio/SOURCES.json`. The files were downloaded from:

- [100 CC0 SFX #2 by rubberduck](https://opengameart.org/content/100-cc0-sfx-2) — footfalls, metal, stone, glass, street/highway, construction, water and machine loops, UI sounds, thunder.
- [Helicopter SFX by WuxiaScrub](https://opengameart.org/content/helicopter-sfx) — flyby.
- [Propeller (Cartoon) Loop by Mish7913](https://opengameart.org/content/propeller-cartoon-loop) — loop.
- [Car engine sound loops by domasx2](https://opengameart.org/content/racing-car-engine-sound-loops) — driving engines.
- [Calm Loop by wipics](https://opengameart.org/content/calm-loop) — quiet city music.
- [Project Utopia by congusbongus](https://opengameart.org/content/project-utopia-seamless-loop) — disaster music.
- [Explosions by EZduzziteh](https://opengameart.org/content/explosions-4).
- [Explosion Tilesets by elnineo](https://opengameart.org/content/explosion-tilesets).
- [Storm & Siren by TinyWorlds](https://opengameart.org/content/storm-siren).
- [Wind Whoosh Loop by SketchMan3](https://opengameart.org/content/wind-whoosh-loop).

License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Attribution is not required, but creator links are retained for transparency. No copyrighted commercial songs or branded voices.

## Verification
- `npm run build` ensures Vite bundles game files while copying all `public/audio` assets.
- `npm run test:recorded:browser` validates actual Chrome sound loading, OGG/MP3 decoding, no auto-play, activation by tap, music and SFX playback, mute/unmute and scene reset on both desktop and emulated Android.
- All existing city/survival/disaster/recovery regression tests remain unchanged.

Note: real-device listening and adjustment still matter; browser tests can detect missing assets, but not subjectively grade sound quality.
