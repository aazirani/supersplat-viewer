# Museum Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On one branch (`feature/museum-integration`), build the video-screens feature from its spike, and close the gaps two reviews found in the finished door-transitions and annotation-links features.

**Architecture:** Video screens follow the rooms pattern: pure, unit-tested modules (settings parsing, distance curves, rectangle fit) under `src/video/`, engine classes (`VideoScreen`, `SpatialAudio`) that the pure modules drive, and one wiring function that builds a room's screens and rebuilds them on `room:changed`. The polish tasks are small, local changes to the rooms and annotation code plus a `?room=` deep link that reuses the room manager's tap path.

**Tech Stack:** TypeScript, PlayCanvas 2.23 (`Texture.setSource(video)`, `StandardMaterial`, render component), Web Audio (`PannerNode`), `requestVideoFrameCallback`, rollup, `node --test` `.mjs` tests importing `.ts` source.

**Spec:** `docs/superpowers/specs/2026-10-20-video-screens-design.md` (video screens); `docs/superpowers/specs/2026-10-19-museum-door-transitions-design.md` (rooms, for the polish tasks).

## Global Constraints

- A settings file without `videos` must behave exactly as today; without `rooms` likewise.
- Pure modules tested from source (`src/video/videos-settings.ts`, `screen-range.ts`, `fit-screen.ts`, `src/rooms/settle-watch.ts`) use only `import type` and erasable TS (no enums, namespaces, parameter properties).
- Defaults from the spec: `offset 0.01`, `loop true`, `playDistance 20`, `sound.volume 1`, `sound.refDistance 1`, `sound.fadeDistance 12`, fade to silence over the last `3` m, pause hysteresis `playDistance × 1.1`.
- Corner order `[TL, TR, BR, BL]` as seen by a visitor facing the screen; facing normal `normalize((BL − TL) × (TR − TL))`.
- The video element is `muted`, `playsInline`, `crossOrigin = 'anonymous'`, `preload = 'metadata'`; sound is unlocked by the first `pointerdown` or `keydown` inside the viewer root.
- Rendering stays on demand: request a frame only when a new video frame was uploaded.
- Quads are children of the active room's gsplat entity, with corners converted from world to its local frame.
- `state.muted` is a writable, persisted preference (`localStorage` key `muted`), default `false`; it silences video sound and the ambient `soundUrl`.
- Museum settings files in `public/` are git-ignored; only code, tests and docs are committed.
- Every new ui string exists in all 10 locale files under `src/locales/`.

## Review Focus

- A video that 404s or is blocked by CORS → warning once, no quad, viewer unaffected. Test: Task 3 browser step with a wrong `src`.
- The visitor never interacts (idle tour on a kiosk) → video plays muted; no exception from a refused `play()`. Test: Task 4 browser step, reload and do not click.
- Room change while a video plays → old video stops (no audio from the gone room), texture freed, new room's screens built. Test: Task 4 browser step hall → tunnel → hall.
- A `videos` entry with three corners or a non-finite number → skipped with a warning naming `videos[i]`; `validateSettings` throws. Test: Task 1 tests.
- `?room=tunnel&annotation=1` → arrives in the tunnel, then selects its first annotation; a typo in `room` warns and starts in the hall. Test: Task 10 tests for the pure resolver, browser step for the flow.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/video/videos-settings.ts` (new) | `VideoDef`, `readVideos`, `screenFrame` |
| `src/video/screen-range.ts` (new) | `soundLevel`, `playState` |
| `src/video/fit-screen.ts` (new) | `fitScreenCorners` |
| `src/video/video-screen.ts` (new) | `VideoScreen`: video element, texture, quad |
| `src/video/spatial-audio.ts` (new) | `SpatialAudio`: one context, per-screen panner, listener, unlock, mute |
| `src/video/video-screens.ts` (new) | `initVideoScreens`: per-room build/rebuild, distances per update, ambient `soundUrl` per room |
| `src/schemas/v2.ts`, `src/settings.ts` | `videos?` field, strict check, type re-export |
| `src/types.ts`, `src/preferences.ts`, `src/index.ts`, `src/viewer.ts` | `state.muted`, `Viewer.currentGsplat` getter, wiring, ambient sound moved |
| `src/ui.ts`, `src/ui.html`, `src/locales/*.json`, `src/index.scss` | Sound toggle row |
| `src/debug/debug-panel.ts` | "Pick screen" button |
| `src/ui/door-markers.ts`, `src/ui/annotation.ts`, `src/index.scss` | Keyboard access, focus style, reduced motion |
| `src/ui/link-panel.ts`, `src/ui.ts`, `src/index.scss` | Narrow-sheet cover, scoped Escape, same-origin sandbox, RTL header, close on room change |
| `src/rooms/room-manager.ts`, `room-host.ts`, `src/load-gsplat.ts`, `src/viewer.ts`, `src/camera-manager.ts` | XR guard on `enter`, abortable preload, first-room collision kept, animation time reset |
| `src/rooms/settle-watch.ts` (new), `src/index.ts` | Pure settle decision extracted and tested |
| `src/options.ts`, `src/index.html`, `src/start-room.ts` (new), `src/index.ts`, `src/viewer.ts` | `room` option and `?room=` deep link |
| `README.md`, `docs/api.md` | Video screens, Sound, `?room=`, rooms doc fixes |

---

### Task 1: Video settings parsing and screen frame

**Files:**
- Create: `src/video/videos-settings.ts`
- Modify: `src/schemas/v2.ts` (field + strict check), `src/settings.ts` (re-export types)
- Test: `test/videos-settings.test.mjs`, `test/settings.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  type Vec3T = [number, number, number];
  type SoundDef = { volume: number; refDistance: number; fadeDistance: number };
  type VideoDef = { src: string; corners: [Vec3T, Vec3T, Vec3T, Vec3T]; offset: number; loop: boolean; playDistance: number; sound: SoundDef | null };
  const DEFAULT_SOUND: SoundDef = { volume: 1, refDistance: 1, fadeDistance: 12 };
  function readVideos(raw: unknown): { videos: VideoDef[]; warnings: string[] };
  type ScreenFrame = { center: Vec3T; normal: Vec3T; width: number; height: number };
  function screenFrame(corners: VideoDef['corners']): ScreenFrame | null; // null when degenerate (width or height < 1 mm)
  ```
  `ExperienceSettings.videos?: unknown[]` (raw, like `rooms`).

- [ ] **Step 1: Write the failing tests** in `test/videos-settings.test.mjs`, importing `../src/video/videos-settings.ts`, with a `valid()` fixture equal to the spec example (corners from the spike, `offset 0.015`, `sound: { fadeDistance: 10 }`):
  - `returns no videos and no warnings when raw is undefined` → `{ videos: [], warnings: [] }`.
  - `warns when videos is not an array` → `videos: []`, one warning.
  - `parses the spec example with defaults` → `loop === true`, `playDistance === 20`, `offset === 0.015`, `sound` deep-equals `{ volume: 1, refDistance: 1, fadeDistance: 10 }`, no warnings.
  - `sound false means silent` → `sound === null`.
  - `sound omitted means the default sound` → deep-equals `DEFAULT_SOUND`.
  - `skips an entry without src` and `skips an entry with three corners` and `skips a corner with a non-finite number` (`NaN`) → `videos: []`, warning contains `videos[0]`.
  - `skips a non-positive playDistance`, `a negative offset`, `a volume above 1`, `a fadeDistance not above refDistance` → each skipped with a warning.
  - `keeps the valid entries around an invalid one` → two valid + one invalid → two videos, one warning.
  - `screenFrame faces the visitor`: for the spike corners, `normal` within `0.05` per component of `[0.605, 0.796, 0.020]`; `width` within `0.02` of `0.74`, `height` within `0.02` of `0.41`; `center` within `0.01` of the corner mean.
  - `screenFrame rejects a degenerate rectangle` (all corners equal) → `null`.
- [ ] **Step 2: Run** `node --test test/videos-settings.test.mjs` → FAIL (module not found).
- [ ] **Step 3: Implement** `readVideos` (one pass, each skip pushes `videos[i]: <reason>`; `src` must be a non-empty string; `isVec3` on finite numbers; `sound` accepts `false`, `undefined` or an object whose fields default individually) and `screenFrame` (normal as in Global Constraints; width = mean of the top and bottom edge lengths, height = mean of the left and right). No imports.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Schema.** Add `videos?: unknown[]` to `ExperienceSettings` in `src/schemas/v2.ts`; in `validateV2`, mirror the `rooms` block: `if (obj.videos !== undefined)` → `readVideos(obj.videos)` and throw `new Error(warnings[0])`. Re-export `VideoDef`, `SoundDef` from `src/settings.ts`.
- [ ] **Step 6: Add to `test/settings.test.mjs`:** `validateSettings accepts settings with a valid video` and `validateSettings rejects a video with three corners` (message contains `videos[0]`).
- [ ] **Step 7: Run** `npm run test:unit && npm run type:check` → PASS.
- [ ] **Step 8: Commit** `git add src/video/videos-settings.ts src/schemas/v2.ts src/settings.ts test/videos-settings.test.mjs test/settings.test.mjs && git commit -m "Video settings: parse screens, their corners and sound"`

---

### Task 2: Distance curves and rectangle fit

**Files:**
- Create: `src/video/screen-range.ts`, `src/video/fit-screen.ts`
- Test: `test/screen-range.test.mjs`, `test/fit-screen.test.mjs`

**Interfaces:**
- Consumes: `SoundDef`, `Vec3T` (Task 1, type import).
- Produces:
  ```ts
  const FADE_LENGTH = 3;
  const PAUSE_FACTOR = 1.1;
  function soundLevel(distance: number, sound: SoundDef): number;   // 0..volume
  function playState(distance: number, playDistance: number, playing: boolean): boolean;
  type Rect = { corners: [Vec3T, Vec3T, Vec3T, Vec3T]; center: Vec3T; width: number; height: number };
  function fitScreenCorners(points: readonly Vec3T[]): Rect | null; // exactly four points TL, TR, BR, BL; null if degenerate
  ```

- [ ] **Step 1: Write the failing tests** (`sound = { volume: 1, refDistance: 1, fadeDistance: 12 }`):
  - `full volume up to the reference distance` (`0.5` and `1` → `1`).
  - `falls off as one over distance` (`2` → `0.5`, `4` → `0.25`).
  - `fades to silence over the last three metres` (`9` → `1/9`; `10.5` → `0.5 × 1/10.5` within `1e-9`; `12` → `0`; `20` → `0`).
  - `scales with volume` (`volume 0.5`, `d 2` → `0.25`).
  - `plays inside playDistance and keeps playing until ten percent beyond` (`playState(19, 20, false) === true`, `playState(21, 20, true) === true`, `playState(22.1, 20, true) === false`, `playState(21, 20, false) === false`).
  - `fitScreenCorners returns a rectangle on a tilted plane`: build a rectangle `0.74 × 0.41` m rotated by Euler angles `(20°, 50°, 10°)` and translated to `(−8.5, 0.15, −0.85)`, add noise of `±4 mm` to each point (deterministic offsets), expect `width` within `0.01` of `0.74`, `height` within `0.01` of `0.41`, each returned corner within `0.01` of the clean corner, and the returned corners coplanar (scalar triple product of three edges `< 1e-6`).
  - `fitScreenCorners rejects three points` and `collinear points` → `null`.
- [ ] **Step 2: Run** both files → FAIL.
- [ ] **Step 3: Implement.** `soundLevel = volume × min(1, ref/d) × clamp((fade − d) / FADE_LENGTH, 0, 1)`. `fitScreenCorners`: centre = mean; right axis `u` = normalised (midpoint(TR, BR) − midpoint(TL, BL)); plane normal `n` = normalised `(BL − TL) × (TR − TL)`; down axis `v = n × u`... pick the sign so that `v · (BL − TL) > 0`; width = mean projection of top and bottom edges onto `u`; height = mean projection of left and right edges onto `v`; corners = centre ∓ u·w/2 ∓ v·h/2 in TL, TR, BR, BL order. Inline vector helpers; no imports.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git add src/video/screen-range.ts src/video/fit-screen.ts test/screen-range.test.mjs test/fit-screen.test.mjs && git commit -m "Video screens: distance curves and a rectangle fit for picked corners"`

---

### Task 3: VideoScreen and SpatialAudio

**Files:**
- Create: `src/video/video-screen.ts`, `src/video/spatial-audio.ts`

**Interfaces:**
- Consumes: `VideoDef`, `screenFrame` (Task 1); `soundLevel`, `playState` (Task 2).
- Produces:
  ```ts
  // video-screen.ts
  class VideoScreen {
      constructor(app: AppBase, parent: Entity, def: VideoDef, warn: (message: string) => void);
      readonly video: HTMLVideoElement;
      readonly center: Vec3;        // world
      readonly failed: boolean;     // the video errored: no quad
      setDistance(d: number): void; // play/pause through playState; no-op once failed
      setHidden(hidden: boolean): void; // document.hidden: pause; resume per last distance
      destroy(): void;
  }
  // spatial-audio.ts
  class SpatialAudio {
      constructor(root: HTMLElement, warn: (message: string) => void);
      attach(screen: VideoScreen, sound: SoundDef): void;   // builds source → gain → panner once per video element
      detach(screen: VideoScreen): void;
      setMuted(muted: boolean): void;                       // video.muted on every attached screen, and gain 0
      update(camera: Entity, distances: Map<VideoScreen, number>): void; // listener pose + gains
      readonly unlocked: boolean;
      destroy(): void;                                       // removes unlock listeners, closes the context
  }
  ```

- [ ] **Step 1: `VideoScreen`.** Constructor: `screenFrame(def.corners)`; if null, `warn` and set `failed`. Create the `<video>` with the Global Constraints attributes and `loop = def.loop`; `src = def.src`. On `loadedmetadata`: create `Texture` (`PIXELFORMAT_RGBA8`, no mipmaps, clamp addressing, `videoWidth × videoHeight`), `setSource(video)`; build the mesh from the four corners pushed `def.offset` along the normal, converted to `parent`'s local frame with `parent.getWorldTransform().clone().invert().transformPoint(...)`; UVs `[0,0, 1,0, 1,1, 0,1]`, indices `[0, 3, 2, 0, 2, 1]`; `StandardMaterial` with `useLighting = false`, black diffuse, white emissive, `emissiveMap = texture`, `cull = CULLFACE_NONE`; entity with a render component added to `parent`. On `error`: `warn(\`video "${def.src}": ${video.error?.message ?? 'cannot load'}\`)`, destroy the quad, set `failed`. Frame pump: if `'requestVideoFrameCallback' in video`, re-register each callback and `texture.upload(); app.renderNextFrame = true`; else an `app.on('update')` handler that uploads while `!video.paused`. `setDistance(d)`: `const want = playState(d, def.playDistance, playing)`; on change call `video.play().catch(() => undefined)` or `video.pause()`. `destroy()`: pause, `removeAttribute('src')`, `load()`, destroy entity, material and texture, remove listeners.
- [ ] **Step 2: `SpatialAudio`.** Lazy `AudioContext` created on first `attach` (in a try; on failure `warn` once and leave videos muted). Per screen: `createMediaElementSource(video)` → `GainNode(gain 0)` → `PannerNode({ panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 0, positionX/Y/Z: center })` → `destination`. Unlock: `pointerdown` and `keydown` on `root`, capture, once each; both call `ctx.resume()` then set `unlocked`, and apply `video.muted = muted` to attached screens. `update`: write the listener's `positionX/Y/Z`, `forwardX/Y/Z`, `upX/Y/Z` from `camera.getPosition()`, `camera.forward`, `camera.up` (use `.value =` where `setValueAtTime` is unavailable, i.e. Safari's legacy `setPosition/setOrientation`); each gain `= muted ? 0 : soundLevel(d, sound)`. `setMuted`: store, apply `video.muted` and gains. `destroy`: disconnect nodes, remove listeners, `ctx.close()`.
- [ ] **Step 3: Verify** `npm run type:check && npm run lint` → pass (nothing is wired yet).
- [ ] **Step 4: Commit** `git add src/video/video-screen.ts src/video/spatial-audio.ts && git commit -m "Video screen quad with a video texture, and positional sound for it"`

---

### Task 4: Wiring, state.muted and per-room ambient sound

**Files:**
- Create: `src/video/video-screens.ts`
- Modify: `src/types.ts`, `src/preferences.ts`, `src/index.ts` (remove the `soundUrl` block at lines 474–491; call `initVideoScreens`), `src/viewer.ts` (`currentGsplat` getter), `docs/api.md` state table (the `muted` row)

**Interfaces:**
- Consumes: Tasks 1–3; `Viewer.setRoom`, `room:changed`, `global.settings`.
- Produces:
  ```ts
  // src/video/video-screens.ts
  function initVideoScreens(global: Global, viewer: Viewer, gsplatLoad: Promise<Entity>): void;
  // src/viewer.ts
  get currentGsplat(): Entity | null;   // the active room's gsplat entity, null before the first scene
  // src/types.ts
  State.muted: boolean;  // writable; also in WritableStateKey and persisted
  ```

- [ ] **Step 1: State.** Add `muted` to `State` (doc: "Silences the scene's sound: video screens and the ambient track. Persisted."), to `WritableStateKey`, to `Preferences` and both lists in `preferences.ts` (default `false`), and to the `observe` initial state via `...preferences`.
- [ ] **Step 2: Viewer getter.** Replace the `currentGsplat` field's external use by a getter returning the field (keep the private field, rename it `activeGsplat`).
- [ ] **Step 3: `initVideoScreens`.** On `gsplatLoad` (and not destroyed): build for `global.settings.videos` with `viewer.currentGsplat` as parent; on `room:changed` with `previous !== null` destroy all screens, detach audio, stop the ambient track, and build again from the new `global.settings` and `viewer.currentGsplat`. Per `app.on('update')`: when any screen exists, compute distances from `viewer.cameraManager?.camera.position ?? global.camera.getPosition()` to each `screen.center`, call `setDistance`, then `audio.update(global.camera, distances)`. `visibilitychange` → `setHidden(document.hidden)` on each screen and pause/resume the ambient track. `muted:changed` → `audio.setMuted`, ambient `muted`. Ambient track: if the room's settings have `soundUrl`, an `Audio` element with `crossOrigin='anonymous'`, `loop = true`, `muted = state.muted`, started on the same unlock gesture (reuse `SpatialAudio`'s listeners by giving it an `onUnlock` callback list, or add `audio.ambient(url)` to it — one of the two; the ambient element must also play when the context cannot be created). Build nothing (no update handler, no listeners) when the first room has neither `videos` nor `soundUrl` and there are no rooms. Tear down in `viewer.onDestroy`.
- [ ] **Step 4: Wire** `initVideoScreens(global, viewer, gsplatLoad)` in `createViewer` next to `initRooms`; delete the old `soundUrl` block and `disposeAudio`.
- [ ] **Step 5: Museum settings.** Add the spec's `videos` entry to `public/museum-settings.json` (not committed). Serve (`npm run build && npm run serve`), open `http://localhost:3000/?content=./museum/lod-meta.json&settings=./museum-settings.json&budget=2`, look at the display case: the sample video plays on the screen; the label in front still draws over it; click once: sound; walk away: quieter, silent across the room, the frame counter (`?ministats`) still when far; hall → tunnel: no sound, no screen; back: screen and sound return. Repeat once with `&stochastic` and once with `&webgl`. Set `src` to a wrong file: one `console.warn`, no black quad. Reload without clicking: video plays muted, no console error.
- [ ] **Step 6: Verify** `npm run type:check && npm run lint && npm run test:unit` → pass.
- [ ] **Step 7: Commit** `git add -A src docs/api.md && git commit -m "Video screens: build per room, follow the camera with sound, one mute for the scene"`

---

### Task 5: Sound toggle and the screen picker

**Files:**
- Modify: `src/ui.html` (settings panel: a `sse-soundRow` after the annotations row), `src/ui.ts` (toggle wiring like `showAnnotations`; row hidden unless the current room has `videos` with sound or `soundUrl`, re-evaluated on `room:changed`), `src/locales/*.json` (`settings.sound`: en "Sound", fa "صدا", de "Ton", es "Sonido", fr "Son", ja "音声", ko "소리", pt-BR "Som", ru "Звук", zh-CN "声音"), `src/debug/debug-panel.ts` (button `data-id="pick-screen"`, title "Click the screen's corners: top-left, top-right, bottom-right, bottom-left; writes a videos entry to the console and clipboard")

**Interfaces:**
- Consumes: `state.muted` (Task 4), `fitScreenCorners` (Task 2), `picker.pickSurface(x, y)` (normalised coordinates as the picker takes them; see how `pick-depth-overlay.ts` or `nav-cursor.ts` call it).

- [ ] **Step 1: Toggle.** Switch active = `!state.muted`; click flips `state.muted`; `muted:changed` updates the class. Row visibility helper `hasSound(settings)`.
- [ ] **Step 2: Picker.** Arming the button adds a one-shot `pointerdown` capture listener on the canvas for each of four picks (ignore drags: cancel a pick whose `pointerup` moved more than 4 px); after four, `fitScreenCorners`; on null flash the button bad; else `console.log(JSON.stringify(entry, null, 2))` and `navigator.clipboard?.writeText(...)`, where `entry = { src: './video.mp4', corners: rounded to 3 decimals, offset: 0.01 }`. Escape or a second click on the button cancels. The picks are world coordinates already (the picker returns them so), which is the settings' frame.
- [ ] **Step 3: Verify in the browser:** the Sound row shows in the hall, flips the sound, persists across reload; it is hidden in the tunnel; Ctrl+Shift+D → Pick screen → four clicks on the screen's bezel corners → the console entry's `width`/`height` within a few cm of `0.74 × 0.41`.
- [ ] **Step 4: Run** `npm run type:check && npm run lint && npm run test:unit` → pass.
- [ ] **Step 5: Commit** `git add src/ui.html src/ui.ts src/locales src/debug/debug-panel.ts src/index.scss && git commit -m "Sound switch in the settings, and a screen picker in the debug panel"`

---

### Task 6: Video screens docs

**Files:**
- Modify: `README.md` (a "Video screens" subsection after "Annotation links": what it does, the sound unlock, same-origin/CORS, the Sound switch, the debug-panel picker), `docs/api.md` (a "Video screens" section before "Settings" with the field table and example from the spec; `muted` in the state table; `videos` in the schema listing)

- [ ] **Step 1: Write** both sections from the spec's Settings and Behaviour sections.
- [ ] **Step 2: Commit** `git add README.md docs/api.md && git commit -m "Docs: video screens"`

---

### Task 7: Keyboard access for markers and hotspots, reduced motion

**Files:**
- Modify: `src/ui/door-markers.ts:83-85`, `src/ui/annotation.ts:110-113`, `src/index.scss` (`.sse-doorMarker`, `.sse-annotation-hotspot`: a `:focus-visible` outline in the accent colour; a `@media (prefers-reduced-motion: reduce)` rule turning off the `.sse-doorMarker-ring` transition)

- [ ] **Step 1: Markers and hotspots** get `tabindex="0"` and a `keydown` handler: `Enter` or `Space` → `preventDefault()` and the same action as a click. A marker with `sse-far` (fade 0) or `display: none` sets `tabindex="-1"` so the tab order skips what cannot be seen (update it where the fade is written).
- [ ] **Step 2: Verify** in the browser: Tab reaches a visible hotspot and the door marker; Enter opens the tooltip / goes through the door.
- [ ] **Step 3: Commit** `git commit -am "Door markers and hotspots reachable by keyboard; ring transition off under reduced motion"`

---

### Task 8: Link panel fixes

**Files:**
- Modify: `src/ui/link-panel.ts`, `src/ui.ts:532-538`, `src/ui/annotations.ts` (tooltip placement reads the new bottom cover), `src/ui/annotation-controls.ts` or the SCSS that positions the prev/next bar, `src/index.scss:1623-1710`
- Test: `test/annotation-links.test.mjs` (add `isSafeUrl` and `trimBareUrl` cases if exported; export them if not)

- [ ] **Step 1: Tests first.** `isSafeUrl`: `https://a/b` true, `/page` true, `./page` true, `//evil` false, `javascript:alert(1)` false, `java\tscript:alert(1)` false, `data:text/html,x` false, `vbscript:x` false. `trimBareUrl` (if it exists): trailing `)`, `]`, `.`, `,` are left out of the url.
- [ ] **Step 2: Run** → FAIL for the cases the code does not yet handle (fix the code if any fail; otherwise they pass and stay as the regression net).
- [ ] **Step 3: Narrow cover.** Add `coveredBottom()` to `LinkPanel` (the sheet's height when open and narrow, else 0) and a `--sse-link-panel-cover-bottom` custom property in `redraw`; the tooltip's placement keeps clear of it (as it does of `--sse-link-panel-cover`), and the annotation bar sits above the sheet (`bottom: calc(... + var(--sse-link-panel-cover-bottom))`).
- [ ] **Step 4: Escape scope.** Keep the window capture listener but act only when `root.contains(event.target as Node) || event.target === document.body`; add to the doc comment that a focused frame keeps its own keys.
- [ ] **Step 5: Same-origin sandbox.** Resolve the url against `location.href`; if its origin equals `location.origin`, omit `allow-same-origin` from the sandbox list.
- [ ] **Step 6: RTL header.** `padding-inline: 16px 8px` instead of the four-value padding; pin the panel with `inset-inline-end: 0` and mirror the slide transform for `[dir=rtl]`/`:lang(fa)` roots the way the tooltip does it.
- [ ] **Step 7: Close on room change.** In `src/ui.ts`'s `room:changed` handler call `linkPanel?.close()` before `annotations?.destroy()`.
- [ ] **Step 8: Verify** in the browser at 400 px wide: open an exhibit's "More info"; the tooltip and the prev/next bar stay above the sheet; Escape in the page's own input (click inside the frame first) does not close it; Escape on the scene does. `npm run test:unit && npm run lint` → pass.
- [ ] **Step 9: Commit** `git commit -am "Link panel: clear of the tooltip on phones, Escape only inside the viewer, tighter sandbox for same-origin pages, rtl header"`

---

### Task 9: Rooms fixes

**Files:**
- Modify: `src/rooms/room-manager.ts` (`enter` + `RoomHost.load` signal), `src/rooms/room-host.ts`, `src/load-gsplat.ts`, `src/viewer.ts` (`setRoom`, constructor settings), `src/camera-manager.ts:227-262`
- Test: `test/room-manager.test.mjs`

**Interfaces:**
- Changes: `RoomHost.load(room: RoomDef, signal: AbortSignal): Promise<R>`; `RoomManager` constructor gains an optional fourth argument `xrActive: () => boolean = () => false`; `loadGsplat(app, source, progress, cancelled)` unchanged in signature, but checks `cancelled()` on each `progress` event too and, when it has become true, removes and unloads the asset and rejects.

- [ ] **Step 1: Failing tests** in `test/room-manager.test.mjs`:
  - `enter() is ignored during an XR session` (construct with `() => true`; `enter(0)` records nothing).
  - `replacing a preloading room aborts its load` (three-room fixture: park `tunnel`, then update inside the cellar door's radius; the fake host's recorded `signal` for the tunnel load has `aborted === true`).
  - `destroy() aborts a preload in flight`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `park()` creates an `AbortController` per `Parked` and aborts the previous one when replacing; `destroy()` aborts the current. The host passes `() => viewer.destroyed || signal.aborted` to `loadGsplat` and checks it after `loadSettings` too. `enter()` returns early when `xrActive()`.
- [ ] **Step 4: First room collision.** In `viewer.ts`, keep the first room's attached `Collision` in a field `firstRoomCollision` when it attaches (and its id, `firstRoomId`, taken from `state.room` at that moment); in `setRoom`, after clearing, if `id === firstRoomId && firstRoomCollision` re-run the attach (`inputController.collision`, `cameraManager.setCollision`, `xr.setCollision`, `navCursor.collision`, `state.hasCollision`, `hasCollisionOverlay`, `walkAllowed`) before `cameraManager.setRoom` so walk stays allowed on return. Replace the constructor-scoped `settings` use at `viewer.ts:466` with `this.global.settings`.
- [ ] **Step 5: Animation time.** In `CameraManager.setRoom` set `state.animationTime = 0` after rebuilding the controller.
- [ ] **Step 6: Run** `npm run test:unit && npm run type:check && npm run lint` → pass. Browser: hall → tunnel → hall with a `collision` url on the page: the walk button is back in the hall.
- [ ] **Step 7: Commit** `git commit -am "Rooms: a tap waits for XR to end, a replaced preload is aborted, the first room keeps its collision, the tour's clock resets"`

---

### Task 10: `?room=` deep link

**Files:**
- Create: `src/start-room.ts`
- Modify: `src/options.ts` (`room?: string` after `annotation`, doc: "Start in this room: after the first scene has loaded, go through the first room's door to it, then apply `annotation` there. Ignored without `rooms`, or when no door of the first room leads to it (a warning says so)."), `src/index.html` (`room: url.searchParams.get('room') ?? undefined`), `src/index.ts` (`initRooms`: after `manager.start()`), `src/viewer.ts:466` (skip the first-room `annotation` when `config.room` names another room), `types.d.ts` if the flags are mirrored there
- Test: `test/start-room.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  type StartRoom = { door: number } | { warning: string } | null;
  function startRoomDoor(room: string | undefined, first: RoomDef, ids: readonly string[]): StartRoom;
  // null: no room asked for, or the first room itself; { door }: index of the first room's door to it;
  // { warning }: unknown room, or no door from the first room leads there
  ```

- [ ] **Step 1: Failing tests:** `null when no room is asked for`; `null for the first room itself`; `the door index to the room`; `a warning naming an unknown room`; `a warning when no door of the first room leads there`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (pure, no imports beyond types). **Step 4: Run** → PASS.
- [ ] **Step 5: Wire.** In `initRooms` after `manager.start()`: `const start = startRoomDoor(global.config.room, rooms[0], rooms.map(r => r.id))`; a warning → `console.warn('[rooms]', warning)`; a door → `manager.enter(start.door)` and, once `room:changed` reports that room, `viewer.selectAnnotation(startAnnotationIndex(config.annotation, global.settings.annotations.length))` when not null. In `viewer.ts`, the first-frame `annotation` selection is skipped when `config.room` is set and differs from `state.room`.
- [ ] **Step 6: Verify** in the browser: `?…&room=tunnel` loads the hall, shows the marker loading, then arrives in the tunnel; `&room=tunnel&annotation=1` with a tunnel annotation selects it; `&room=cellar` warns and stays.
- [ ] **Step 7: Commit** `git add -A src test/start-room.test.mjs && git commit -m "Open a link in another room: ?room= goes through the first room's door to it"`

---

### Task 11: Settle watch extracted and tested, rooms docs

**Files:**
- Create: `src/rooms/settle-watch.ts`
- Modify: `src/index.ts:270-300`, `docs/api.md` Rooms section, `README.md` URL parameters (`?room=`, `?annotation=` first room unless `room`)
- Test: `test/settle-watch.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  const QUIET_DELAY_MS = 1000; const QUIET_CAP_MS = 15000;
  function createSettleWatch(now: number): { frame(ready: boolean, loading: number, now: number): void; reset(now: number): void; settled(now: number): boolean };
  ```

- [ ] **Step 1: Failing tests:** `not settled on the reveal frame` (ready, 0 loading at t=0 → false); `settled after a frame that streamed and then one that did not`; `settled after a quiet frame once a second has passed without streaming`; `settled after fifteen seconds regardless`; `reset starts over`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** by moving the logic out of `initRooms` unchanged. **Step 4: Run** → PASS; `initRooms` uses it.
- [ ] **Step 5: Docs.** `docs/api.md` Rooms: `settingsUrl` row lists what applies (annotations, `cameras[0]`, `animTracks`, post effects, tonemapping, background colour, `videos`, `soundUrl`) and what does not (`rooms`, `background.skyboxUrl`, `startMode`); add the 15 s cap to the preloading sentence; note that `?annotation=` counts the first room's exhibits unless `?room=` names another; document `?room=`. README URL parameters: `room`.
- [ ] **Step 6: Commit** `git add -A src test docs README.md && git commit -m "Rooms: settle decision as a tested module; docs for room settings, the preload cap and ?room="`

---

### Task 12: Final verification

- [ ] **Step 1:** `npm test && npm run lint && npm run type:check && npm run fmt` → all pass (fix formatting with `npm run fmt:fix` if needed).
- [ ] **Step 2: Browser pass** on the museum: start view and idle tour unchanged; `?annotation=1` opens the hall exhibit; video and sound as in Task 4; hall → tunnel → hall by walking and by tapping; `?room=tunnel`; the Sound switch; the original settings without `rooms` and `videos` (keep a copy as `public/museum-plain-settings.json`) behave as before.
- [ ] **Step 3:** Tick every box in this plan, commit `git commit -am "Plan: museum integration done"`.
