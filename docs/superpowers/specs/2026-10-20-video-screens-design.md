# Video screens: design

Date: 2026-10-20. Builds on the spike in `docs/spikes/video-screens/` (feasibility proven on
2026-10-19) and on the rooms work (`2026-10-19-museum-door-transitions-design.md`).

## Goal

A museum scan contains display screens that show a still photo in the scan. The viewer should
play a real video on such a screen, with sound that comes from the screen, fades with distance
and falls silent across the room. Several screens per room, configured in `settings.json`,
each room's screens in its own settings file, so they come and go with the room.

This session ran unattended. Decisions marked **(assumed)** were taken without asking; each is
cheap to change.

## Settings

A new optional top-level field of the v2 settings, `videos`, read leniently by the viewer (bad
entries are skipped with a `console.warn`, as `rooms` are) and strictly by `validateSettings`:

| Field | Meaning |
| --- | --- |
| `src` | The video file. Relative or http(s). Must be same-origin or served with CORS headers (the frame is read into a texture and the sound into Web Audio). |
| `corners` | Four `[x, y, z]` points in viewer world coordinates: top-left, top-right, bottom-right, bottom-left of the picture area, as seen by a visitor facing the screen. Any rectangle in space; need not be axis aligned. |
| `offset` | Optional, metres, default `0.01`. The picture is drawn this far in front of the fitted corners, toward the visitor, so the scan's own splats of the screen do not bleed through. |
| `loop` | Optional, default `true`. |
| `playDistance` | Optional, metres, default `20`. Farther than this from the screen's centre the video pauses (and stops costing frames); it resumes when the visitor comes back inside. |
| `sound` | Optional. `false` plays the video silent. An object: `volume` (0–1, default `1`), `refDistance` (metres, default `1`: full volume up to here, then `1/d`), `fadeDistance` (metres, default `12`: silence from here on, reached over the last 3 m). Default: an object with the defaults. |

**(assumed)** The field is named `videos` and corners are given as four points, which is what
the spike's plane fit produces and what the placement helper (below) writes. A centre, normal and
size would be more compact but is harder to read off a scan.

Each room's settings file carries its own `videos`; the first room's come from the page's
settings. A room without the field has no screens.

Example (the museum's screen, corners from the spike, sample video):

```json
"videos": [
    {
        "src": "./sample.mp4",
        "corners": [
            [-8.687, 0.289, -0.485],
            [-8.644, 0.275, -1.228],
            [-8.316, 0.026, -1.197],
            [-8.361, 0.041, -0.467]
        ],
        "offset": 0.015,
        "sound": { "fadeDistance": 10 }
    }
]
```

## Architecture

```
settings.videos ──readVideos()──▶ VideoDef[]
                                     │
   index.ts: initVideoScreens(global, viewer)
     on first scene / room:changed ──▶ VideoScreens (one per room, rebuilt per room)
                                         ├─ VideoScreen × n   (video element, texture, quad entity)
                                         └─ SpatialAudio      (one AudioContext per viewer, shared)
   ui.ts: "Sound" toggle ◀──▶ state.muted (persisted)
   debug panel: "Pick screen" ──▶ fitScreenCorners(4 picks) ──▶ JSON to clipboard + console
```

Pure, unit-tested modules (no engine imports, erasable TS only, tested from source like the
rooms modules):

- `src/video/videos-settings.ts`: `VideoDef`, `readVideos(raw): { videos, warnings }`,
  `screenFrame(corners)`: centre, unit normal facing the visitor (`(BL−TL) × (TR−TL)`,
  normalised), width and height; rejects degenerate corners.
- `src/video/screen-range.ts`: `soundLevel(distance, sound)` → gain multiplier
  (`min(1, refDistance / d)` × a linear fade to 0 over the last 3 m before `fadeDistance`);
  `playState(distance, playDistance, playing)` with hysteresis (pause beyond
  `playDistance × 1.1`, resume inside `playDistance`), so a visitor standing at the edge does not
  flicker the video.
- `src/video/fit-screen.ts`: `fitScreenCorners(points)`: from four picked points returns a true
  rectangle on their best plane (centre = mean, right axis from the left and right edge midpoints,
  normal from the cross product, height axis orthogonal), with its size in metres.

Engine modules:

- `src/video/video-screen.ts` — `class VideoScreen`: creates the `<video>` (`muted`, `playsInline`,
  `crossOrigin='anonymous'`, `preload='metadata'`, `loop` from settings), a `Texture` sized on
  `loadedmetadata`, a two-triangle mesh at the corners pushed out by `offset`, an unlit
  `StandardMaterial` (emissive map, no culling), a render-component entity **parented to the
  room's gsplat entity** (corners converted from world to that entity's local frame), so the XR
  grab-move and ice cream carry the screen with the scan. Uploads the texture only on a new video
  frame (`requestVideoFrameCallback`; browsers without it upload on each app update while
  playing) and sets `app.renderNextFrame = true` each time. `setDistance(d)` drives play/pause
  through `playState`; `play()` tolerates autoplay refusals (a muted video autoplays everywhere
  that matters; the sound is unlocked separately). A video `error` removes the quad and warns, so
  a missing file leaves the scan's photo rather than a black panel. `destroy()` pauses, drops
  `src`, destroys the entity, texture and material.
- `src/video/spatial-audio.ts` — `class SpatialAudio`: lazily creates one `AudioContext`; per
  screen a `MediaElementAudioSourceNode → GainNode → PannerNode(HRTF, inverse, refDistance,
  rolloffFactor 1) → destination`. The panner sits at the screen centre (world); the listener is
  written from the camera's world position, forward and up on each app `update` while any
  screen is audible. The gain is `volume × soundLevel(d)` (the panner's `1/d` is thus doubled
  up; **(assumed)** we instead set the panner's `rolloffFactor` to 0 and do all distance
  attenuation in the gain, keeping the panner for direction only — one curve, one unit test).
  **Unlock:** the context starts suspended and the videos muted; the first `pointerdown` or
  `keydown` inside the viewer's root (capture phase, once) resumes the context and unmutes the
  videos unless `state.muted`. The existing ambient `soundUrl` audio keeps its own click-to-play
  but also follows `state.muted`.
- `src/video/video-screens.ts` — `initVideoScreens(global, viewer)`: reads the current
  settings' `videos`, builds the screens once the first scene has loaded, rebuilds them on
  `room:changed` from the new room's settings and its gsplat entity, feeds camera distances to
  the screens and audio each `update`, pauses everything while `document.hidden`, and tears
  down on viewer destroy. Nothing is built for a settings file without `videos`.

UI:

- `state.muted: boolean` (writable, persisted like `showAnnotations`, default `false`): silences
  every screen and the ambient sound. The settings panel gets a "Sound" row (`settings.sound`),
  shown only when the current room has sound to offer; its switch mirrors `!state.muted`.
  **(assumed)** a settings-panel row rather than a toolbar button: it needs no icon and the
  museum's toolbar is already full on phones.
- Debug panel: a "Pick screen" button arms the next four clicks on the canvas; each picks a
  surface point (`picker.pickSurface`) in the order TL, TR, BR, BL; the result of
  `fitScreenCorners` is written as a `videos` entry to the console and the clipboard. Escape or
  the button cancels. This replaces the spike's console scripting for editors.

Viewer exposure: `Viewer` gets a read-only `currentGsplat` getter (the active room's entity),
which `video-screens.ts` parents the quads to. `ViewerHandle` and `ViewerState` gain `muted`.

## Behaviour

- Start: videos load their metadata, autoplay muted when within `playDistance`, sound arrives
  on the first interaction. Rendering on demand is kept: a frame is requested only when a video
  frame arrived from a playing, in-range screen.
- Distance: beyond `playDistance` the video pauses and its sound stops; the fade reaches silence
  at `fadeDistance`, whatever the panner would still carry through walls.
- Rooms: the screens belong to a room's settings; on a door transition the old room's screens
  are destroyed (video stopped, GPU texture freed) before the new ones are built. A parked,
  preloading room has no screens.
- XR: the quads are children of the scan entity, so they follow it when it is grabbed or
  shrunk; the listener follows the XR camera like any other.
- Hidden tab: videos pause; they resume on return if in range.
- Errors: a video that cannot load or decode warns once and leaves no quad; an `AudioContext`
  that cannot be created (very old browsers) leaves the videos muted; a refused autoplay retries
  on the first interaction.

## Testing

Unit (`node --test`): `readVideos` validation and defaults; `screenFrame` normal direction
checked against the spike's measured normal; `soundLevel` at the reference, mid, fade start,
fade end and beyond; `playState` hysteresis; `fitScreenCorners` on a tilted rectangle with
noise. Settings: `validateSettings` accepts the example and rejects a three-corner entry.

Browser, on the museum (served from `public/`): the sample video plays on the screen in the
display case under both renderers (workbuffer and stochastic) and WebGL/WebGPU; the paper label
in front of the screen still draws over it; sound starts on the first click and is louder near
the screen, directional when turning, silent across the room; walking far pauses the video and
the viewer stops rendering (frame counter still); the hall → tunnel transition removes the
screen and sound; back in the hall it returns; the Sound switch silences and restores; a
settings file without `videos` behaves as before. Then `npm test`, `npm run lint`,
`npm run type:check`.

## Out of scope

- Authoring in SuperSplat itself (the debug-panel picker is the editor for now).
- Streaming formats (HLS/DASH); plain `<video>` sources only.
- Playback controls on the screen (play/pause by tapping the screen), subtitles.
- Removing the scan's own screen splats; that is done in the editor, and `offset` hides most of
  the bleed meanwhile.
