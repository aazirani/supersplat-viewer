# Museum door transitions — design

Date: 2026-10-19
Branch: `feature/museum-door-transitions`
Status: approved in conversation, awaiting written-spec review

## Goal

Let a visitor move between separately scanned splat scenes ("rooms") of the museum by going
through a doorway. The first pair is the main hall (`public/museum/`) and the cinema tunnel
(`public/tunnel/`, unpacked from `Tunnel Cinema Museum.zip`, CC BY 4.0, Ali Kharaghanian). The
next room loads in the background as the visitor approaches its door, so the switch is fast.

Success looks like: a visitor walks (or taps a marker) from the hall into the tunnel and back,
each switch is a short fade, GPU memory returns to roughly one room's worth after every switch,
and a settings file without rooms behaves exactly as today.

## Decisions taken

- **Transition style: quick fade.** The two scans are in unrelated coordinate frames (each is
  centred on its own origin; the tunnel scan also contains a sparse view of the hall). No
  alignment is attempted. Going through a door fades to black (~0.2 s), the camera is placed at
  an arrival pose in the destination room's own coordinates, and the view fades back in.
- **How visitors go through: walk in, or tap the marker.** Walking into the doorway triggers it
  in fly/walk mode. A ripple marker with the destination's name sits in the doorway and can be
  tapped in any mode. Orbit mode never triggers by position, because an orbiting camera can
  sweep through walls.
- **Placement: done by hand in the settings file.** No authoring tool; the coordinates for the
  hall↔tunnel door below were found from top-down plans of both scans and checked in the viewer.
- **Architecture: rooms live inside one viewer instance** (not a viewer restart per room), since
  only that allows background preloading and avoids re-creating the graphics device.

## Spike findings this design relies on

A throwaway spike (museum + a shifted copy of itself) showed:

- A second `gsplat` entity can stream in while the first one is shown; the octree streams by
  distance, so a far-away room loads only its coarse levels until it is close.
- Disabling the old room's entity does **not** free its tiles (GPU memory stayed at ~970 MB for
  25 s). Destroying the entity and unloading its asset does (back to ~670 MB, one room).
- Swapping collision through the existing setters works; replacing the gsplat entity and moving
  the camera (`cameraManager.camera` + `snap()`) causes no frame hitch beyond normal rendering.
- Both rooms share the scene-wide splat budget, so preloading slightly lowers the current room's
  detail while it runs.
- Sizes: each room is ~180–190 MB in total; the coarsest level is ~20 MB, the two coarsest
  together ~50 MB.

## Visitor experience

1. The page starts in the hall exactly as today: same start view, idle tour, annotations and
   `?annotation=N` links.
2. When the camera comes within the door's preload radius (default 8 m), the tunnel starts
   loading in the background. Nothing visible changes.
3. A ripple marker labelled «تونل» sits in the doorway. It fades with distance like the exhibit
   markers, but is not hidden by the "show annotations" toggle.
4. Walking into the doorway (fly/walk mode, WASD or joystick) or tapping the marker starts the
   transition: fade to black, swap, fade in at the arrival pose, looking into the tunnel.
5. If the destination is not ready yet (its preload level has not finished loading, e.g. on a
   slow connection), the screen stays black with a small spinner until it is, then fades in.
6. In the tunnel, annotations are the tunnel's own (none yet), and the idle tour starts from the
   arrival pose. The tunnel's door marker «تالار» leads back to the hall the same way.
7. Door triggers are paused during an XR session.

## Settings format

A new optional top-level field `rooms` in the experience settings (v2). The first entry is the
page's own scene: it takes its content and settings from the page as today, so it has no
`contentUrl` or `settingsUrl`.

```json
"rooms": [
  {
    "id": "hall",
    "doors": [
      {
        "to": "tunnel",
        "label": "تونل",
        "center": [5.0, 0.3, -5.8],
        "size": [1.4, 2.6, 1.0],
        "preloadRadius": 8,
        "arrival": { "position": [-5.3, 1.35, -0.75], "target": [0, 1.2, -0.75] }
      }
    ]
  },
  {
    "id": "tunnel",
    "contentUrl": "./tunnel/lod-meta.json",
    "settingsUrl": "./tunnel-settings.json",
    "doors": [
      {
        "to": "hall",
        "label": "تالار",
        "center": [-6.8, 0.9, -0.75],
        "size": [1.0, 2.4, 1.4],
        "arrival": { "position": [5.0, 0.6, -4.2], "target": [5.0, 0.3, 2.0] }
      }
    ]
  }
]
```

Field meanings:

| Field | Meaning |
|---|---|
| `id` | Unique room name, referenced by `to`. |
| `contentUrl` | The room's splat file (any format the viewer loads). Required except for the first room. |
| `settingsUrl` | Optional. The room's own experience settings: annotations, `cameras[0]`, post effects. Missing → the room has no annotations and reuses the first room's look (tonemapping, post effects, background). |
| `doors[].to` | Destination room id. |
| `doors[].label` | Marker text, shown as written (the museum writes Persian). |
| `doors[].center`, `size` | Axis-aligned trigger box in **this** room's world coordinates (metres; `size` is the full width/height/depth). The marker sits at `center`. |
| `doors[].preloadRadius` | Optional, default 8. Distance from `center` at which the destination starts loading. |
| `doors[].arrival` | Camera position and look-at target in the **destination** room's coordinates. Must lie outside the destination's own door boxes. |

Coordinates are world coordinates as the viewer shows them (the splat entity is rotated 180°
about Z, so they are not the file's raw coordinates). Floors: hall ≈ y −1.0, tunnel ≈ y −0.25.
The values above are the starting values; they are fine-tuned in the browser during
implementation and the final ones go into the settings files.

Validation: `rooms` is checked when settings are read. Invalid entries (unknown `to`, duplicate
`id`, missing `contentUrl` on a non-first room, malformed vectors) are skipped with a
`console.warn`; the rest keeps working. A file without `rooms`, or with one room and no doors,
behaves exactly as today.

The museum's settings files stay in `public/` next to the scans (untracked, as today):
`public/museum-settings.json` gains `rooms`, and a new `public/tunnel-settings.json` holds the
tunnel's look and start camera with an empty annotation list. The format is documented in
`docs/api.md` with this museum as the example.

## Components

New files, each with one job:

- **`src/rooms/rooms-settings.ts`** — types for `rooms`/doors and `readRooms(settings)`, which
  validates and returns a clean list (plus warnings). Pure, no engine imports, unit-tested from
  source.
- **`src/rooms/door-trigger.ts`** — pure decision logic. Input: camera position, camera mode, XR
  active, the current room's doors, and which doors are armed. Output: rooms to preload and at
  most one door to go through. A door re-arms only after the camera has been outside its box (so
  an arrival or a turn-around cannot bounce straight back). Orbit/anim modes and XR never
  trigger by position. Unit-tested from source.
- **`src/rooms/room-manager.ts`** — owns the rooms at runtime:
  - knows the current room (its entity, asset, settings) and any preloading room;
  - `preload(id)`: fetches the room's settings file and creates its `gsplat` entity **parked**
    out of sight (1 km below the current room, beyond the camera's far clip) held at the middle
    detail level (`lodRangeMin = lodRangeMax = 2` of levels 0–3, or the coarsest level if the
    room has fewer), so it fetches a useful whole-room level first and is never seen;
  - ready: every file of the parked level is resident (single-file formats: the asset loaded);
  - preloading starts only after the first room has revealed (`firstFrame`); the hall's start
    view is within 3 m of its door and must not compete with the first load;
  - `enter(door)`: runs the transition sequence below; ignores further requests while one runs;
  - frees a preloaded room that is no longer wanted only when another room needs the slot (at
    most one preload at a time).
- **`src/ui/door-markers.ts`** — DOM ripple markers for the current room's doors, reusing the
  annotation hotspot look (`.sse-annotation-ripple`, distance fade via `distanceFade`) with a
  text label. Positioned every frame with `camera.worldToScreen`, hidden behind the camera.
  Click → `roomManager.enter(door)`. Rebuilt on every room change.
- **Fade overlay** — a full-screen black layer in the UI with a CSS opacity transition and a
  spinner shown only while waiting for a room to become ready.

## Transition sequence

`enter(door)`:

1. Mark busy; disable door triggers; stop camera movement input.
2. Fade to black (200 ms). If the destination is not preloaded yet, start preloading it now.
3. Wait until the destination is ready (preload level resident). Show the spinner if this takes
   longer than ~300 ms. If loading fails, fade back in to the current room, `console.warn`, and
   leave the door armed.
4. Move the destination entity from its parked position to the origin and lift the LOD cap.
5. Destroy the old room: destroy its entity and unload its asset (frees its tiles; required, see
   spike findings). Destroy its annotations and door markers.
6. Make the destination the current room: update the scene bounds, apply its look settings
   (`configureCamera` with its settings), rebuild annotations and door markers from its lists,
   reset `state.selectedAnnotation`, and call `cameraManager.setRoom(...)` with its bounds,
   settings and the door's arrival pose (camera is placed there and snapped).
7. Fade in (200 ms). Clear busy; door triggers resume (the destination's doors start disarmed
   until the camera has been outside their boxes).

## Changes to existing code

Kept to what the swap needs:

- **`src/index.ts`** — `loadGsplat` becomes reusable for any url and returns the entity plus its
  asset; settings fetching for room files reuses the existing `importSettings` path. The room
  manager is created when settings contain usable rooms.
- **`src/viewer.ts`** — code that captured the first scene now goes through "the current room":
  - `sceneBound` is recomputed in place from the new entity;
  - `applyPerfSettings` writes LOD ranges to the current room's gsplat component, not the one
    captured at startup;
  - `configureCamera` reads the current room's settings (also in the `xrMode:changed` handler);
  - XR grab target (`xr.setGrabTarget`) gets a replace path that releases the previous helper
    scripts instead of leaking them, and is pointed at the new room's entity.
- **`src/camera-manager.ts`** — new `setRoom(bbox, settings, arrival)`: recomputes the reset
  camera (the room's `cameras[0]`, else the arrival pose), the frame camera, and rebuilds the
  idle-tour track (figure-8 from the arrival pose, or the room's anim track when `startMode`
  is `animTrack`), then places the camera at the arrival pose and snaps.
- **`src/ui/annotations.ts`, `src/ui/annotation-controls.ts`, `src/ui.ts`** — annotations and
  their controls can be rebuilt from a new list; the annotation layer and link panel are created
  even when the first room has no annotations, so a later room's can appear.
- **`src/schemas/v2.ts`, `src/settings.ts`** — optional `rooms` added to the settings type and
  exported; `validateV2` checks it (unknown top-level keys are already tolerated).
- **`src/types.ts`** — `ViewerHandle.annotations` becomes a getter for the current room's list;
  new state key `room` (current room id, `null` without rooms), so hosts and the UI get
  `room:changed`. `docs/api.md` notes that annotation indices are per room.

## Error handling

- Invalid `rooms` entries are skipped with a warning; the page still works.
- A room's splat or settings file failing to load: the transition is cancelled (fade back in to
  the current room), the door stays usable, and a warning is logged. A failed background preload
  is retried on the next approach.
- The viewer being destroyed mid-transition or mid-preload: continuations check the existing
  `destroyed` flag and stop.
- Rapid repeated triggers (double tap, walking back and forth): ignored while a transition runs;
  doors re-arm only after the camera leaves them.

## Testing

Unit tests (`node --test`, `.mjs`, importing the pure `.ts` modules from source like
`test/hotspot-fade.test.mjs`):

- `rooms-settings`: valid config; first room without `contentUrl`; unknown `to`; duplicate ids;
  bad vectors; missing `rooms`.
- `door-trigger`: preload radius; box entry; orbit/anim/XR never trigger; re-arming after leaving;
  arrival inside a door box stays disarmed.
- `room-manager` transition order with fake loader, fake fade and fake timers: fade → wait →
  swap → destroy old → fade in; failure path; busy guard.

In the browser, on the real hall and tunnel (served from `public/`):

- hall → tunnel → hall by walking, and by tapping the marker; orbit mode only via the marker;
- GPU memory (`app.graphicsDevice._vram`) and resident tile count back to about one room after
  each switch;
- annotations and the idle tour correct in each room; `?annotation=3` still opens the hall
  exhibit;
- the original `museum-settings.json` without `rooms` behaves exactly as before;
- then `npm test`, `npm run lint`, `npm run type:check`.

## Out of scope (first version)

- Per-room collision files (neither scan has one). Rooms run without collision; the page-level
  `collisionUrl`, if any, applies to the first room only and is cleared on leaving it.
- Changing rooms during an XR session (doors pause in XR).
- Links or QR codes that open directly in a room other than the first.
- Seamless (aligned, no-fade) transitions.
- Stochastic renderer: rooms must share one splat format (the stochastic renderer compiles for
  the first format it sees); both current rooms are SOG LOD, so this holds.
