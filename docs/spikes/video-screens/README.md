# Spike: video on a scanned screen, with positional sound

Date: 2026-10-19. Status: feasibility proven, nothing built into the viewer yet.

The museum scan has a display screen in a case (it shows a still photo in the scan). The idea is to
play a real video on it, with sound that comes from the screen and fades with distance. Both work.
The code here is throwaway; it is kept as a reference for building the feature properly.

## Findings

### Video on the screen

- **Placement.** The screen's surface was found by picking a grid of depths over the bright part of
  the screen and fitting a plane (156 of 182 samples within ~4 mm). The 4 corners were then found by
  casting rays through the screen's corner pixels onto that plane. Result: 0.74 × 0.41 m, 16:9.
  Picking the black parts of the screen is unreliable (dark glossy splats pick 0.2–0.6 m too deep),
  so the fit has to use textured parts or the bezel.
- **Rendering.** A quad mesh with an unlit `StandardMaterial` (emissive map = video texture),
  in the World layer. Splats in front (the paper label) correctly draw over it, from the front and
  from steep side angles.
- **UVs.** The video came out upside down at first; the UVs that work are `[0,0, 1,0, 1,1, 0,1]` for
  corners TL, TR, BR, BL.
- **Haze.** The scanned photo's splats sit 1–3 cm in front of the fitted plane and show through as a
  faint blue streak. Offsetting the quad 4 cm hides it but looks like it floats. Better fix: delete the
  screen's splats in the SuperSplat editor, then use a small offset (~5 mm–1.5 cm).
- **Cost.** Uploading the frame adds no measurable cost (~31 fps with or without the video, with the
  viewer forced to render every frame). The real cost is that the viewer, which normally only renders
  when something changes, must keep rendering while a video plays. Upload only on a new video frame
  (`requestVideoFrameCallback`), not every tick.

### Positional sound

- `MediaElementAudioSourceNode` → `PannerNode` (HRTF, `inverse`, `refDistance` 1 m) → destination,
  with the `AudioListener` position and orientation copied from the camera on every `update`.
  The video element must be unmuted (a muted element feeds silence into the graph).
- Measured level (after the panner ÷ before it, so the video's own loudness cancels out):

  | Distance | Measured | Expected (1/d) |
  |---|---|---|
  | ≤ 1 m | 100% | 100% |
  | ~2 m | 52–64% | 50–57% |
  | 4 m | 27% | 25% |
  | ~8–9 m | 9–13% | 11–12.5% |
  | 16 m | 6.5% | 6% |

- Turning works: facing the screen the ears are within ~1 dB; turned 90° either way, the near ear is
  3–4 dB louder.

## Open questions for the real feature

- **Settings format:** a `videos` list in `settings.json` (source, 4 corners, offset, sound options).
- **Placing screens:** the corners came from console scripting. Editors need a way to pick a screen.
- **Fade to silence:** the inverse model never reaches zero (9% across the room, through walls).
  Add a per-video distance where the sound fades to nothing.
- **First click:** browsers block sound until a click or tap (Brave allowed it on localhost, real
  visitors will be blocked). Start muted and enable sound on the first interaction, or show a
  "tap for sound" button.
- **Rendering on demand:** keep rendering only while a video is visible and playing; pause videos
  that are off-screen or far away.

## Running it again

1. Apply the debug globals: `git apply docs/spikes/video-screens/viewer-globals.patch`
   (exposes `window.__pc` and `window.__picker`; never commit this to `src/`).
2. Copy the scene and a video into `public/` (ignored by git): the museum LOD scene to
   `public/museum/`, its settings to `public/museum-settings.json`, a video to `public/sample.mp4`,
   and `spike-video.js` from this folder to `public/`.
3. `npm run develop`, then open
   `http://localhost:3000/?content=./museum/lod-meta.json&settings=./museum-settings.json&budget=2`
   and look at the screen in the display case.
4. In the console:
   ```js
   await new Promise(r => { const s = document.createElement('script'); s.src = './spike-video.js'; s.onload = r; document.head.appendChild(s); });
   await spikeVideo();            // video on the screen (corners are hard-coded for the museum scan)
   __spike.video.muted = false;   // needed for sound
   spikeAudio();                  // positional sound; __audio.measure() returns the level ratio
   ```
5. Revert the patch: `git checkout src/viewer.ts`.
