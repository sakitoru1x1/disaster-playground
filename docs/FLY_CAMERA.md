# Free flight camera / infinite sky

The game now has a separate **FLY (G)** camera. It is a no-collision spectator camera,
unrestricted by a focal point, orbit radius, or maximum zoom. Switch freely between
FLY, normal orbit and first-person WALK. Switching on free flight starts from the
current orbit viewpoint rather than teleporting back to the street. The on-screen
flight controls work on touch devices, including phones in portrait and landscape.

### Controls
* **Desktop:** button ✈ FLY or **G** toggles flight. Hold **W / A / S / D**
  or arrow keys to move, **E** to ascend, **Q** to descend, **Shift** for 3.4×
  boost. **Drag on the canvas** to rotate the camera. **Mouse wheel** adjusts
  flight speed. Click/tap on a building or on the ground to deploy a disaster
  normally even when flying.
* **Phone/tablet:** tap ✈ FLY, **swipe** on the main scene to look around,
  hold the four direction arrows to fly and the ＋ UP / － DOWN buttons to
  change altitude. Tap the scene to deploy a disaster. Tap FLY again to
  return to the existing orbit controls.
* **Existing WALK mode (V)** remains a separate ground-survival game mode.

### Sky
Old sky was a 900-meter inverted sphere drawn as an in-world dome; moving
farther away or above it exposed its shell. That sphere and the anchored
fake sun have been removed entirely. Background sky is now a **2D
camera-independent gradient layer** rendered behind the 3D world. Its
appearance is not dependent on camera altitude or zoom, and cannot show
a globe/sphere boundary. The far clip plane of free flight is 6000m.

### Automated QA
Run `npm run test:fly-camera` to verify in real headless Chrome on PC and
emulated Android: there is no atmosphere-sphere mesh, the backdrop exists,
FLY toggles, vertical/forward movement responds, targeting is valid with
the active camera, mobile buttons are visible, and orbit mode returns.
`npm run test:browser` covers older city/disaster/phone regression checks.
