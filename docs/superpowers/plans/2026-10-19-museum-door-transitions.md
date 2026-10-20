# Museum Door Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor move between separately scanned museum rooms (hall ↔ tunnel) through doorways, with background preloading and a short fade.

**Architecture:** Three pure, unit-tested modules decide everything (settings parsing, door triggers, the room manager's preload/transition state machine). An engine-side "room host" implements the side effects the manager asks for (load a parked gsplat, wait for readiness, activate, release, fade). The viewer and camera manager gain a `setRoom` that swaps their per-scene state; the UI rebuilds annotations and door markers on `room:changed`.

**Tech Stack:** TypeScript, PlayCanvas engine 2.23 (gsplat octree streaming), rollup, `node --test` with `.mjs` tests.

**Spec:** `docs/superpowers/specs/2026-10-19-museum-door-transitions-design.md`

## Global Constraints

- A settings file without `rooms` (or with fewer than two valid rooms) must behave exactly as today.
- Pure modules tested from source (`src/rooms/rooms-settings.ts`, `door-trigger.ts`, `room-manager.ts`) may only use `import type` and erasable TS syntax (no enums, namespaces, parameter properties) — Node strips types itself (see `src/input/app/mode-shortcuts.ts`).
- Leaving a room must destroy its gsplat entity **and** unload its asset; disabling alone keeps its tiles in GPU memory.
- Default preload radius: `8` m. Fade duration: `200` ms each way. Spinner appears only if waiting longer than `300` ms. Park offset: `[0, -1000, 0]`. Parked detail level: `2` (or `lodLevels - 1` if smaller).
- Preloading never starts before the first room has revealed (`firstFrame`).
- Position triggers only in camera modes `fly` and `walk`, never during XR; markers work in every mode.
- Door labels are shown verbatim (hall door «تونل», tunnel door «تالار»).
- Coordinates in settings are viewer world coordinates (entity rotated 180° about Z), each in its own room's frame; `arrival` is in the destination room's frame.
- Museum settings files live in `public/` (git-ignored); only code, tests and docs are committed. The tunnel's `license.txt` stays next to its scan.

## Review Focus

- Start camera already inside a preload radius (the hall's start view is ~3 m from its door) → preload begins only after the first reveal. Test: `room-manager` ignores `update` until `start()`.
- Double tap / walking back and forth during a transition → second request ignored. Test: `room-manager` busy guard.
- Destination's splat or settings fails to load → fade back into the current room, warning, door still usable, preload retried on the next approach. Test: `room-manager` failure path.
- Arrival pose inside one of the destination's door boxes → no immediate bounce back. Test: `door-trigger` starts disarmed.
- Approaching a door to a different room while another room is preloaded → old preload released before the new one loads (at most one parked room). Test: `room-manager` preload slot.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/rooms/rooms-settings.ts` (new) | Types `RoomDef`, `DoorDef`, `ArrivalPose`; `readRooms(raw)` lenient parse + warnings |
| `src/rooms/door-trigger.ts` (new) | `evaluateDoors(...)`: preload wishes, door to enter, re-arming |
| `src/rooms/room-manager.ts` (new) | `RoomManager<R>`: preload slot, transition sequence, busy guard, via a `RoomHost<R>` |
| `src/rooms/room-host.ts` (new) | Engine implementation of `RoomHost`: parked gsplat load, readiness, activate, release |
| `src/rooms/fade-overlay.ts` (new) | Black overlay with fade + delayed spinner |
| `src/load-gsplat.ts` (new, moved from `src/index.ts`) | `loadGsplat(...)` returning `{ entity, asset }` |
| `src/ui/door-markers.ts` (new) | DOM ripple markers with labels for the current room's doors |
| `src/schemas/v2.ts`, `src/settings.ts` | `rooms?` on `ExperienceSettings`; strict check in `validateV2` |
| `src/viewer.ts` | `setRoom(...)`, current-room gsplat for perf settings, settings read live |
| `src/camera-manager.ts` | `setRoom(bbox, settings, arrival)` |
| `src/xr.ts` | `setGrabTarget` releases previous helpers |
| `src/types.ts` | `State.room`, `Global.rooms`, handle `annotations` getter |
| `src/index.ts`, `src/ui.ts`, `src/ui/annotations.ts`, `src/ui/annotation-controls.ts`, `src/index.scss` | Wiring and rebuild on `room:changed` |
| `docs/api.md` | `rooms` format, `state.room`, per-room annotation indices |

---

### Task 1: Rooms settings parsing

**Files:**
- Create: `src/rooms/rooms-settings.ts`
- Modify: `src/schemas/v2.ts` (type field + `validateV2`), `src/settings.ts` (re-export types)
- Test: `test/rooms-settings.test.mjs`, `test/settings.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  type Vec3T = [number, number, number];
  type ArrivalPose = { position: Vec3T; target: Vec3T };
  type DoorDef = { to: string; label: string; center: Vec3T; size: Vec3T; preloadRadius: number; arrival: ArrivalPose };
  type RoomDef = { id: string; contentUrl?: string; settingsUrl?: string; doors: DoorDef[] };
  const DEFAULT_PRELOAD_RADIUS = 8;
  function readRooms(raw: unknown): { rooms: RoomDef[]; warnings: string[] };
  ```
  `ExperienceSettings.rooms?: unknown[]` (raw; the viewer always goes through `readRooms`).

- [ ] **Step 1: Write the failing tests** in `test/rooms-settings.test.mjs` (import `../src/rooms/rooms-settings.ts`), using a `valid()` fixture equal to the spec's hall/tunnel example:
  - `returns no rooms and no warnings when raw is undefined` → `{ rooms: [], warnings: [] }`.
  - `warns when rooms is not an array` → `rooms: []`, `warnings.length === 1`.
  - `parses the spec example` → two rooms, ids `['hall','tunnel']`, hall has no `contentUrl`, tunnel `contentUrl === './tunnel/lod-meta.json'`, hall door `preloadRadius === 8` (defaulted), tunnel door `preloadRadius === 8`, `warnings` empty.
  - `keeps an explicit preloadRadius` (set `12` → `12`).
  - `disables rooms when the first entry is invalid` (first has no `id`) → `rooms: []`, one warning.
  - `skips a non-first room without contentUrl` → one room left, warning mentions the id.
  - `skips a duplicate id` → later duplicate dropped, warning.
  - `skips a door with a malformed vector` (`center: [1, 2]`) → room kept with 0 doors, warning.
  - `skips a door whose target room does not exist` (`to: 'cellar'`) and `a door to its own room` → doors dropped, warnings.
  - `skips a door with a non-positive size component` (`size: [1, 0, 1]`).
- [ ] **Step 2: Run** `node --test test/rooms-settings.test.mjs` → FAIL (module not found).
- [ ] **Step 3: Implement `readRooms`** in `src/rooms/rooms-settings.ts`. Two passes: validate rooms (first-entry rule, ids, `contentUrl` for non-first, vectors via a local `isVec3` on finite numbers, `label` a non-empty string, `preloadRadius` positive finite or default), then drop doors whose `to` is unknown or equal to the room's own id. Every skip pushes one human-readable warning naming the room/door path (e.g. `rooms[1].doors[0]: unknown room "cellar"`). No imports.
- [ ] **Step 4: Run** `node --test test/rooms-settings.test.mjs` → PASS.
- [ ] **Step 5: Hook into the schema.** In `src/schemas/v2.ts` add `rooms?: unknown[]` to `ExperienceSettings` and, in `validateV2`, `if (obj.rooms !== undefined)` call `readRooms(obj.rooms)` and throw `new Error(warnings[0])` if any warning (producers get strict validation; the viewer path stays lenient). Re-export the `RoomDef`, `DoorDef`, `ArrivalPose` types from `src/settings.ts`.
- [ ] **Step 6: Add to `test/settings.test.mjs`:** `validateSettings accepts settings with valid rooms` and `validateSettings rejects rooms with an unknown door target` (message contains `unknown room`).
- [ ] **Step 7: Run** `npm test` → all PASS.
- [ ] **Step 8: Commit** `git add src/rooms/rooms-settings.ts src/schemas/v2.ts src/settings.ts test/rooms-settings.test.mjs test/settings.test.mjs && git commit -m "Rooms settings: parse and validate doors between scenes"`

---

### Task 2: Door trigger logic

**Files:**
- Create: `src/rooms/door-trigger.ts`
- Test: `test/door-trigger.test.mjs`

**Interfaces:**
- Consumes: `DoorDef` (Task 1), `CameraMode` from `src/types.ts` (type import only).
- Produces:
  ```ts
  type Point = { x: number; y: number; z: number };
  type DoorDecision = { preload: string[]; enter: number | null; armed: boolean[] };
  function insideDoor(door: DoorDef, p: Point): boolean;
  function evaluateDoors(doors: readonly DoorDef[], p: Point, mode: CameraMode, xrActive: boolean, armed: readonly boolean[]): DoorDecision;
  ```
  Callers start a room with `armed = doors.map(() => false)`.

- [ ] **Step 1: Write the failing tests** (`test/door-trigger.test.mjs`, one door: `center [0,0,0]`, `size [2,2,2]`, `preloadRadius 8`, `to 'b'`):
  - `insideDoor is true at the centre and on the face, false just outside` (`x = 1` → true, `x = 1.01` → false).
  - `preloads the destination within the radius` (`x = 7.9` → `preload: ['b']`), `not beyond it` (`x = 8.1` → `[]`), in every mode including `orbit` and `anim`.
  - `a disarmed door re-arms once the camera is outside it` (`armed [false]`, outside → `armed [true]`, `enter null`).
  - `an armed door is entered in fly and walk` → `enter: 0`.
  - `never enters in orbit or anim, or during XR` → `enter: null`.
  - `a disarmed door is not entered while the camera stays inside it` (arrival inside a box: `armed [false]`, inside → `enter null`, `armed [false]`).
  - `preload lists each destination once` (two doors to `'b'` → `['b']`).
- [ ] **Step 2: Run** `node --test test/door-trigger.test.mjs` → FAIL.
- [ ] **Step 3: Implement** in `src/rooms/door-trigger.ts`: distance from `center` (Euclidean) for preload; box half-extents `size / 2`; a door re-arms when the point is outside; the first armed door containing the point is entered when `mode` is `fly`/`walk` and `!xrActive`. Pure, returns a new `armed` array.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git add src/rooms/door-trigger.ts test/door-trigger.test.mjs && git commit -m "Door triggers: preload radius, walk-in boxes and re-arming"`

---

### Task 3: Room manager state machine

**Files:**
- Create: `src/rooms/room-manager.ts`
- Test: `test/room-manager.test.mjs`

**Interfaces:**
- Consumes: `RoomDef`, `DoorDef`, `ArrivalPose` (Task 1); `evaluateDoors`, `Point` (Task 2).
- Produces:
  ```ts
  type RoomHost<R> = {
      load(room: RoomDef): Promise<R>;          // creates the room parked and hidden
      whenReady(instance: R): Promise<void>;    // resolves when the parked level is resident
      activate(instance: R, room: RoomDef, arrival: ArrivalPose): void; // unpark + viewer.setRoom
      release(instance: R): void;               // destroy entity + unload asset
      fade(opaque: boolean): Promise<void>;
      setWaiting(on: boolean): void;
      warn(message: string): void;
  };
  class RoomManager<R> {
      constructor(rooms: RoomDef[], first: R, host: RoomHost<R>);
      readonly current: RoomDef;     // getter
      readonly busy: boolean;        // getter
      start(): void;                 // allow preloading (call on firstFrame)
      update(p: Point, mode: CameraMode, xrActive: boolean): void; // per frame
      enter(doorIndex: number): Promise<void>; // door of the current room; ignored while busy
      onChange: ((room: RoomDef) => void) | null; // fired after activate
      destroy(): void;               // releases the parked room
  }
  const FADE_WAIT_SPINNER_MS = 300;
  ```

- [ ] **Step 1: Write the failing tests** with a fake host that records calls into an array (`'load:tunnel'`, `'fade:true'`, `'ready:tunnel'`, `'activate:tunnel'`, `'release:hall'`, `'fade:false'`, `'waiting:true'`…) and lets each test resolve/reject `load` and `whenReady` by hand; rooms = spec example; `first = 'hall-instance'`. Use `mock.timers` for the spinner delay.
  - `does not preload before start()` → `update` near the hall door records nothing.
  - `preloads the destination once when within the radius after start()` → one `load:tunnel` across several updates.
  - `walking into the door runs fade → ready → activate → release old → fade in, in that order`, and `current.id === 'tunnel'` afterwards, `onChange` called once with the tunnel.
  - `enter() loads the destination if it was not preloaded`.
  - `shows the spinner only after 300 ms of waiting and hides it before fading in` (`waiting:true` after advancing 300 ms, `waiting:false` before `fade:false`; not shown at all if ready within 300 ms).
  - `ignores a second enter() while busy` → one `activate`.
  - `failure: load rejects → fades back in, warns, stays in the hall, door works again` (second `enter` triggers a new `load:tunnel`).
  - `a failed preload is retried after leaving and re-entering the radius`.
  - `at most one parked room: preloading another room releases the previous preload` (three-room fixture: hall doors to `tunnel` and `cellar`).
  - `after arriving, the destination's doors start disarmed` (camera at a tunnel door box centre right after arrival → no new transition).
  - `destroy() releases a parked room`.
  - `destroy() during a transition stops it`: no `activate` after the pending `whenReady` resolves, and the loaded instance is released.
- [ ] **Step 2: Run** `node --test test/room-manager.test.mjs` → FAIL.
- [ ] **Step 3: Implement `RoomManager`.** Keep one parked slot `{ id, promise, instance? }` and a `failed` set (cleared for an id when it is no longer in the preload list). `update` does nothing before `start()` or while busy; otherwise calls `evaluateDoors` with the current room's doors and stored `armed`, starts preloads, and calls `enter` for a decided door. `enter` sequence per spec "Transition sequence" steps 1–7; on any rejection: `setWaiting(false)`, `release` the failed instance if any, `fade(false)`, `warn`, clear busy, keep the room. On success reset `armed` for the new room to all `false`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git add src/rooms/room-manager.ts test/room-manager.test.mjs && git commit -m "Room manager: background preload slot and fade transition sequence"`

---

### Task 4: Viewer and camera manager can switch rooms

**Files:**
- Create: `src/load-gsplat.ts` (move `loadGsplat` and `contentName` out of `src/index.ts`)
- Modify: `src/index.ts`, `src/viewer.ts`, `src/camera-manager.ts`, `src/xr.ts`, `src/types.ts`

**Interfaces:**
- Consumes: `ArrivalPose` (Task 1).
- Produces:
  ```ts
  // src/load-gsplat.ts
  type GsplatSource = { contentUrl: string; contentFilename?: string | null; contents?: Promise<Response> };
  function loadGsplat(app: AppBase, source: GsplatSource, progress: (p: number) => void, cancelled: () => boolean): Promise<{ entity: Entity; asset: Asset }>;
  // src/viewer.ts (assigned once the first scene has loaded; undefined before)
  setRoom: (room: { id: string; entity: Entity; settings: ExperienceSettings }, arrival: ArrivalPose) => void;
  // src/camera-manager.ts
  setRoom: (settings: ExperienceSettings, arrival: ArrivalPose) => void; // bbox is the shared sceneBound, already updated
  // src/xr.ts: setGrabTarget(entity, scene) now destroys the previous XrIceCream / XrGrabMove / XrManipulation first
  // src/types.ts
  State.room: string | null;            // also on ViewerState (read-only); initial null
  Global.rooms: RoomManager<unknown> | null; // set in index.ts, initial null
  ViewerHandle.annotations              // becomes a getter over global.settings.annotations
  ```

- [ ] **Step 1: Move `loadGsplat`** to `src/load-gsplat.ts` with the signature above (resolve `{ entity, asset }`); `src/index.ts` uses `.then(({ entity }) => entity)` for the existing `gsplatLoad`. Run `npm run type:check` → no errors.
- [ ] **Step 2: Viewer reads settings live.** Replace the constructor-captured `settings` in the `xrMode:changed` handler with `this.global.settings`. Keep a `currentGsplat: Entity` field (initially `results[0]`); `applyPerfSettings` writes `lodRangeMin/Max` to `currentGsplat.gsplat`.
- [ ] **Step 3: `Viewer.setRoom`** (assigned inside the `Promise.all` block, next to `attachCollision`): set `global.settings`, `currentGsplat`; `sceneBound.setFromTransformedAabb(entity.gsplat.customAabb, entity.getWorldTransform())`; `this.configureCamera(settings)`; `this.xr.setGrabTarget(entity, isWalkableSize(sceneBound))`; clear collision if attached (`inputController.collision = null`, `cameraManager.setCollision(null)`, `navCursor.collision = null`, `state.hasCollision = false`, `state.hasCollisionOverlay = false`, `state.collisionOverlayEnabled = false`); `state.selectedAnnotation = null`; `cameraManager.setRoom(settings, arrival)`; `applyPerfSettings()`; `state.room = id`; `app.renderNextFrame = true`.
- [ ] **Step 4: `CameraManager.setRoom`.** Turn `frameCamera`, `resetCamera`, `isObjectExperience` into `let`s and rebuild them (reset camera = `settings.cameras[0].initial` if present, else the arrival pose with the current fov); rebuild `controllers.anim` from `getAnimTrack(resetCamera, isObjectExperience)` and update `state.hasAnimation` / `state.animationDuration`; place `this.camera` at the arrival pose (`look(position, target)`); new mode: keep `orbit`, keep `walk` if still allowed, otherwise `fly`; then `snap()`.
- [ ] **Step 5: XR grab target replace.** In `setGrabTarget`, destroy existing `iceCream`, `grabMove` and `manipulation` (script destroy on `parent`) before creating new ones.
- [ ] **Step 6: Types and handle.** Add `room` to `State` (initial `null` in `index.ts`'s `observe`) and `ViewerState`; `Global.rooms` (initial `null`); handle `annotations` as `get annotations() { return global.settings.annotations; }`.
- [ ] **Step 7: Verify** `npm run type:check`, `npm run lint`, `npm test` → all pass. In the browser (`npm run serve`, `/?content=./museum/lod-meta.json&settings=./museum-settings.json`): page behaves exactly as before (start view, idle tour, annotations, `?annotation=3`).
- [ ] **Step 8: Commit** `git commit -am "Viewer and camera manager can switch to another room's scene and settings"` (plus `git add src/load-gsplat.ts`).

---

### Task 5: Room host, fade overlay and wiring

**Files:**
- Create: `src/rooms/room-host.ts`, `src/rooms/fade-overlay.ts`
- Modify: `src/index.ts`, `src/index.scss`

**Interfaces:**
- Consumes: `RoomHost`, `RoomManager` (Task 3); `readRooms` (Task 1); `loadGsplat`, `Viewer.setRoom`, `Global.rooms` (Task 4); `importSettings` (`src/settings.ts`).
- Produces:
  ```ts
  // src/rooms/fade-overlay.ts
  function createFadeOverlay(root: HTMLElement): { fade(opaque: boolean): Promise<void>; setWaiting(on: boolean): void; destroy(): void };
  // src/rooms/room-host.ts
  type RoomInstance = { id: string; entity: Entity; asset: Asset; settings: ExperienceSettings };
  const PARK_OFFSET: [number, number, number] = [0, -1000, 0];
  const PARK_LEVEL = 2;
  function createRoomHost(global: Global, viewer: Viewer, overlay: ReturnType<typeof createFadeOverlay>): RoomHost<RoomInstance>;
  ```

- [ ] **Step 1: Fade overlay.** `div.sse-roomFade` appended to `root`, full-size, black, `opacity` transition `200ms`, `pointer-events: none` while transparent and `auto` while opaque; child `.sse-roomFade-spinner` shown with `.sse-waiting`. `fade()` resolves after 200 ms (timer, not `transitionend`, so it also resolves when hidden). Styles in `src/index.scss` next to the poster styles; respect `prefers-reduced-motion` with an instant cut.
- [ ] **Step 2: Room host.**
  - `load(room)`: settings = `importSettings(await (await fetch(room.settingsUrl)).json())` if `settingsUrl`, else the first room's settings with `annotations: []` and `cameras: []`; entity via `loadGsplat(app, { contentUrl: room.contentUrl }, () => {}, () => viewer.destroyed)`; `entity.setLocalPosition(...PARK_OFFSET)`; for octree resources `lodRangeMin = lodRangeMax = Math.min(PARK_LEVEL, lodLevels - 1)`.
  - `whenReady(i)`: resolves when every octree file with that `lodLevel` is in `octree.fileResources` (poll on the gsplat system's `frame:ready`); non-octree resources resolve at once.
  - `activate(i, room, arrival)`: `setLocalPosition(0, 0, 0)`, then `viewer.setRoom({ id: room.id, entity, settings }, arrival)`.
  - `release(i)`: `entity.destroy()`, `asset.unload()`, `app.assets.remove(asset)`.
  - `fade` / `setWaiting` delegate to the overlay; `warn` → `console.warn('[rooms]', message)`.
  - The first room's instance is built from the existing gsplat entity, its asset (`entity.gsplat.asset`, resolved through `app.assets.get` if it is an id) and `global.settings`.
- [ ] **Step 3: Wiring in `src/index.ts`.** After the viewer exists: `const { rooms, warnings } = readRooms(global.settings.rooms)`; log each warning; if `rooms.length >= 2`, once `gsplatLoad` resolves create the overlay, host and `RoomManager`, set `global.rooms`, `state.room = rooms[0].id`; `events.once('firstFrame', () => manager.start())`; per frame (`app.on('update')`) call `manager.update(viewer.cameraManager.camera.position, state.cameraMode, state.xrMode !== null)`; destroy manager and overlay in `viewer.onDestroy`.
- [ ] **Step 4: Verify parking in the browser.** Temporarily add a `public/tunnel-settings.json` copy of `museum-settings.json` with `annotations: []` and the `rooms` block from the spec in `public/museum-settings.json`. Serve, load the museum, wait for the first reveal, fly toward the hall door, then in the console check the parked tunnel's `entity.gsplat.resource.octree.fileResources.size` grows to the level-2 file count (3) and the tunnel is not visible. **If it stays 0 at 1 km:** change `PARK_OFFSET` to `[0, 0, 60]` (outside the hall, as in the spike) and re-check; note the outcome in the commit message.
- [ ] **Step 5: Verify a walk-in transition** hall → tunnel → hall: fade, arrival pose, `app.graphicsDevice._vram` back to about one room (~650–700 MB) within a few seconds of each switch, `state.room` changes. `npm run type:check && npm run lint && npm test` → pass.
- [ ] **Step 6: Commit** `git add src/rooms/room-host.ts src/rooms/fade-overlay.ts src/index.ts src/index.scss && git commit -m "Room host: parked background preload, fade overlay, wiring"`

---

### Task 6: Door markers and per-room annotations in the UI

**Files:**
- Create: `src/ui/door-markers.ts`
- Modify: `src/ui.ts`, `src/ui/annotation-controls.ts` (if it needs a fresh list), `src/index.scss`

**Interfaces:**
- Consumes: `Global.rooms` (`current.doors`, `enter`), `state.room` / `room:changed` (Task 4), `distanceFade` (`src/ui/hotspot-fade.ts`).
- Produces:
  ```ts
  class DoorMarkers {
      constructor(app: AppBase, camera: Entity, layer: HTMLElement, doors: readonly DoorDef[], onEnter: (index: number) => void);
      destroy(): void;
  }
  ```

- [ ] **Step 1: Door markers.** One `div.sse-doorMarker` per door in a `div.sse-doorMarkers` layer inside `.sse-sceneLayer` (sibling of `.sse-annotations`, so the "show annotations" toggle does not hide it), containing a `span.sse-annotation-ripple`-styled ripple and a `span.sse-doorMarker-label` with `door.label` (`dir="auto"`). Positioned on `app` `prerender` with `camera.camera.worldToScreen(center)`, hidden when behind the camera; distance fade via `distanceFade(d, 4, 12)` like the hotspots. `click` → `stopPropagation()` and `onEnter(index)`. Ripple animation copied from `src/ui/annotation.ts` (same WAAPI keyframes and reduced-motion check). Styles in `src/index.scss` reuse the hotspot sizes/colours; the label sits below the dot with a dark pill background.
- [ ] **Step 2: Rebuild on room change in `src/ui.ts`.** If `global.rooms` is set: always create the link panel and `Annotations` (even with an empty list); create `DoorMarkers` for `global.rooms.current.doors`; on `room:changed` destroy and recreate `Annotations`, the annotation controls (`initAnnotationControls` dispose + re-init) and `DoorMarkers`. Without rooms the existing code path is unchanged.
- [ ] **Step 3: Verify in the browser:** marker «تونل» visible in the hall doorway, fades with distance, stays when annotations are hidden; tapping it in orbit mode transitions; in the tunnel only «تالار» shows and the hall's annotations are gone; back in the hall the annotations return and `?annotation=3` still works on a fresh load. `npm run type:check && npm run lint && npm test` → pass.
- [ ] **Step 4: Commit** `git add src/ui/door-markers.ts src/ui.ts src/ui/annotation-controls.ts src/index.scss && git commit -m "Door markers and per-room annotations"`

---

### Task 7: Museum configuration, coordinate tuning, docs and final verification

**Files:**
- Modify (untracked): `public/museum-settings.json`, create `public/tunnel-settings.json`
- Modify: `docs/api.md`

- [ ] **Step 1: Tune coordinates.** Starting from the spec values, adjust in the browser until: the hall box covers the arched doorway at the hall floor (y ≈ −1.0) so flying into it triggers; the tunnel box covers the passage (floor y ≈ −0.25); both arrival poses face into their room and sit outside the destination's boxes; markers sit visibly in the doorways. Keep the tunnel's `cameras[0].initial` equal to the tunnel arrival pose.
- [ ] **Step 2: Write the final files.** `public/museum-settings.json` gets the tuned `rooms` block; `public/tunnel-settings.json` = hall look settings, `cameras` = tunnel arrival, `annotations: []`, `startMode: 'default'`. Validate both with `validateSettings` from `dist/settings.js` (a one-off `node -e`) → no throw.
- [ ] **Step 3: Document** in `docs/api.md`: a "Rooms and doors" section with the field table from the spec and the museum example; `state.room` in the state table; `annotations` note that indices are per room when rooms are configured and change on `room:changed`.
- [ ] **Step 4: Full verification** in the browser, per the spec's Testing section: hall → tunnel → hall by walking and by tapping; orbit only via marker; `_vram` back to one room after each switch; idle tour starts from the arrival pose in the tunnel; `?annotation=3` opens the hall exhibit; the original settings without `rooms` (copy saved before Step 2) behaves as before; throttled network (Chrome DevTools "Fast 4G") shows the spinner and then fades in. Then `npm test`, `npm run lint`, `npm run type:check` → all pass.
- [ ] **Step 5: Commit** `git add docs/api.md && git commit -m "Docs: rooms and doors"`
