# API Reference

Embedding, runtime control and settings for `@playcanvas/supersplat-viewer`.

## Embedding the viewer

If you generate a page around the viewer, use `renderViewerHtml`. It returns a complete
document, with your asset URLs and settings supplied through a single JSON block:

```ts
import { renderViewerHtml } from '@playcanvas/supersplat-viewer';

const document = renderViewerHtml({
    bootstrap: {
        settings,                      // an object, or omit and set settingsUrl
        contentUrl: 'scene.sog',
        posterUrl: 'poster.jpg'
    },
    baseHref: '/viewer/',              // serving from a sub-path
    backgroundColor: [0, 0, 0],        // components are 0..1, not 0..255
    headExtras: '<script src="analytics.js"></script>',
    inlineCss: true                    // no sibling index.css needed
});
```

Called with no options it returns the document the package ships, unmodified. URL parameters
on the served page override the bootstrap's asset URLs, so an embed stays overridable per
instance — except an inline `settings` object, which takes precedence over `?settings=`.

Set both `inlineCss` and `inlineJs` for a single self-contained file, with the splat passed as
a `data:` URI in `contentUrl` and the settings supplied inline through the bootstrap's
`settings` object — without an inline settings object the page still fetches `./settings.json`
from a sibling file. A `data:` URI has no filename and the splat format is chosen by the
name's extension, so name its content with the bootstrap's `contentFilename` (e.g.
`scene.sog`). The flags are independent, so a server that serves the bundle from its own
route can inline only the stylesheet.

`html` is still exported as a raw string, but is **deprecated**: its formatting is not part of
this package's API and changes between releases, so pattern-matching it is unsupported. `css`
and `js` remain exported for serving (or writing) the stylesheet and bundle alongside a
rendered document that doesn't inline them.

## Creating a viewer in your own page

The `/viewer` subpath creates the viewer inside an element you supply, for an app that owns its
own page. `playcanvas` is a peer dependency of this entry, so your copy of the engine is the
one used:

```ts
import { createViewer } from '@playcanvas/supersplat-viewer/viewer';
import '@playcanvas/supersplat-viewer/viewer.css';

const viewer = await createViewer({
    container: document.getElementById('viewer'),   // you size it; the viewer fills it
    settings: './settings.json',                    // a URL, or a settings object
    contentUrl: './scene.sog',
    posterUrl: './poster.jpg'                       // optional, as are the other assets
});
```

The viewer builds its own subtree (canvas, UI and icons) inside the container, so **the
container needs a size**: an element with no height renders nothing. Every option other than
`container`, `settings` and `contentUrl` is optional; the switches are the programmatic form of
the [URL parameters](../README.md#url-parameters).

`createViewer` resolves once the graphics device exists and loading has started, not once the
scene is visible. It returns:

| Member | Purpose |
| --- | --- |
| `state` | Observable state. Writable keys (`cameraMode`, `performanceMode`, `showAnnotations`, `gamingControls`, `animationPaused`, `collisionOverlayEnabled`, `controlsHidden`, `inputEnabled`, `muted`) apply at once; the rest are the viewer's to report and are `readonly` in the types. `state.room` is the current room's id when two or more usable rooms are configured, else `null`. It stays `null` until the first scene has loaded, then `room:changed` fires once with the first room's id (before `loaded` turns true). On each door transition it fires while the screen is black: after the new room is in place and before the old room is released and the view fades back in |
| `events` | Fires `<key>:changed` with `(value, previous)` for every key of `state` |
| `annotations` | The current room's annotation data in settings order, available as soon as creation resolves. A getter: after `room:changed` it reflects the new room. Editing entries is unsupported |
| `captureFrame(options?)` | Renders offscreen, supersampled, and resolves to `{ width, height, data }` with `data` base64. Waits for the first frame |
| `seek(time)` | Selects the animation camera and seeks in seconds, preserving pause state. Requires a loaded viewer with an animation; throws for non-finite time or after destruction. Requests rendering without waiting for a frame |
| `frameScene()` | Frames the whole scene, in orbit mode; requires `state.loaded` |
| `resetCamera()` | Restores the fly/walk entry spawn, or the authored initial view in orbit mode; requires `state.loaded` |
| `toggleWalk()` | Enters walk mode or restores the previous mode. Does nothing if `walkAllowed` is false; requires `state.loaded` |
| `selectAnnotation(index)` | Selects a zero-based annotation index and transitions to its orbit camera. Pass `null` to clear selection without starting another camera movement; requires `state.loaded` |
| `setMoveInput(x, z)` | Holds normalized camera-relative movement in fly/walk, with positive x right and positive z forward. Send `(0, 0)` to stop; requires `state.loaded` |
| `requestFullscreen()` / `exitFullscreen()` | Enter or leave fullscreen for this viewer. Return promises; available before scene readiness |
| `startXR('ar' \| 'vr')` / `endXR()` | Start or end an immersive session. Return promises; starting requires `state.loaded` |
| `destroy()` | Releases the engine application, the graphics context, every listener and the subtree. Idempotent |
| `app` | The underlying PlayCanvas application, for anything this API doesn't cover |

Wait for the first frame through `state`, which is also how you'd drive a loading indicator:

```ts
viewer.events.on('progress:changed', (progress) => console.log(`${progress}%`));
viewer.events.on('loaded:changed', () => console.log('first frame rendered'));
```

Several viewers can share a page. Each owns its subtree and its own engine application, and
nothing is published to `window` unless you ask for it with `exposeGlobals`. Keyboard and
gamepad input is the exception, because those listeners cannot be routed by hit-testing: clear
`state.inputEnabled` on the instances that should ignore them, and while your own controls have
focus.

Always `destroy()` a viewer you are finished with. Browsers cap live WebGL contexts at around
16, so a component that mounts and unmounts without tearing down will stop rendering.

### Controlling playback

The host and built-in playback controls use the same API. Host changes update the buttons and timeline automatically; the same calls work with `ui: false` and custom controls. Read the current state when attaching controls, then subscribe to its change events.

```ts
const stopAt = (seconds: number) => {
    viewer.state.animationPaused = true;
    viewer.seek(seconds);
};

// Seek requires the first complete frame, unlike createViewer's creation promise.
if (viewer.state.loaded) {
    stopAt(3);
} else {
    viewer.events.once('loaded:changed', () => stopAt(3));
}

// Resume, including when another camera mode is active.
const play = () => {
    viewer.state.cameraMode = 'anim';
    viewer.state.animationPaused = false;
};
```

`animationTime`, `animationDuration` and `hasAnimation` are read-only observations. Seeking wraps repeat tracks and clamps once and ping-pong tracks to their duration. It preserves pause state; pause first to stop at the requested time. Hosts can pause from `animationTime:changed` to respond to a playback threshold, at the viewer's update cadence.

Dragging the built-in timeline pauses playback. Releasing or cancelling the drag does not restore an earlier pause flag, so it cannot undo a host command issued during scrubbing. Use Play to resume. The standalone `window.scrubTo` hook retains its pause-and-wait-for-frame behavior; `seek()` itself is synchronous.

### Controlling the camera

After loading, set `viewer.state.cameraMode` to select orbit, fly or animation mode. Check `state.walkAllowed` before selecting walk mode; it requires collision data and a scene large enough to walk in. `toggleWalk()` provides the built-in walk button's behavior, returning to the previous mode on the next call, including when the host entered walk by writing the state directly. Mode changes update the built-in buttons automatically.

`frameScene()` switches to orbit and frames the full scene. `resetCamera()` preserves fly/walk mode and restores the spawn recorded when that mode was entered; from orbit or animation it restores the authored initial view in orbit mode, falling back to scene framing when no initial view exists. Both start a camera transition and return immediately. These commands work with the built-in UI or with `ui: false`.

Camera commands throw before `state.loaded` or after destruction, matching `seek()`. In particular, `frameScene()` now reports those invalid calls instead of silently doing nothing. Desktop gaming controls still depend on the browser's pointer-lock rules; enter them from a user gesture.

### Replacement movement controls

`setMoveInput(x, z)` supplies held movement for a custom joystick or directional buttons. Values must be finite and are clamped independently to `[-1, 1]`. Positive x strafes right; positive z moves forward in the camera's basis, along the ground in walk mode. Movement uses the normal camera/collision path and cancels target navigation. It does not select a camera mode, so select fly or walk first; calls in other modes or XR are ignored and are not queued.

```ts
// After loading, when a directional control is pressed:
viewer.state.cameraMode = 'fly';
viewer.setMoveInput(0, 1);

// On release, pointercancel, lostpointercapture or control unmount:
viewer.setMoveInput(0, 0);
```

The value stays active until replaced. The viewer clears it on camera/XR mode changes, window blur, document visibility changes and destruction. This explicit command works independently of `gamingControls`, `inputMode` and `inputEnabled`; the latter continues to gate keyboard/gamepad input. The built-in touch joystick uses the same command and clears its held input when hidden or cancelled. Canvas touch gestures remain part of the core input system with or without the overlay. Real touch-device gesture and capture checks remain necessary alongside the simulated harness checks.

### Saved preferences

`performanceMode`, `gamingControls`, `showAnnotations` and `muted` load from and write changes to the existing origin-wide local-storage keys, with or without the built-in UI. Creation does not write defaults; the legacy `retinaDisplay` migration is preserved. A new viewer reads the saved values; already-mounted viewers keep their own state rather than synchronizing through storage. The host can change these preferences through the corresponding writable state fields. Storage denial or quota errors leave the viewer usable, and destruction removes its persistence subscriptions. The built-in UI also remembers whether its controls panel is open, under the origin-wide key `controlsPanelOpen`; it is open for a new visitor until they close it.

### Controlling annotations

`viewer.annotations` contains each annotation's title, text, position, camera and optional extras. Indices follow settings order. Without `rooms` they stay fixed for the instance; when rooms are configured they are per room and change on `room:changed`, so re-read `viewer.annotations` and expect `state.selectedAnnotation` to be reset to `null`. Treat the data as read-only; runtime annotation editing is not supported.

`state.selectedAnnotation` is the selected index, or `null` when nothing is selected. Observe `selectedAnnotation:changed` to update custom controls or panels; it fires when the index changes. The built-in hotspots and previous/next buttons use the same `selectAnnotation(index)` command as the host:

```ts
viewer.events.on('selectedAnnotation:changed', (index, previous) => {
    const annotation = index === null ? null : viewer.annotations[index];
    console.log('Selected annotation', annotation, 'previous index', previous);
});

const selectFirst = () => {
    if (viewer.annotations.length) viewer.selectAnnotation(0);
};
if (viewer.state.loaded) selectFirst();
else viewer.events.once('loaded:changed', selectFirst);
```

Selection switches to orbit and transitions to the annotation's authored camera without changing the animation pause flag. Selecting the same index again navigates again. `selectAnnotation(null)` clears selection while leaving the camera and any transition alone. Commands return immediately and throw before readiness, after destruction, or for an index that is not an integer in range. Clearing an empty annotation list is valid.

With `ui: false`, the same data, selection and camera navigation are available; the host supplies presentation. `state.showAnnotations` controls built-in visibility and does not clear selection, so showing annotations again restores the selected panel. The built-in navigator retains its last title and navigation position after dismissal, greyed out while nothing is selected; clicking it selects that annotation again. Clicking elsewhere inside this viewer clears selection; clicking host controls or another viewer does not.

### Fullscreen and XR

Fullscreen and XR commands work with the built-in controls or `ui: false`. Call entry commands directly from a user gesture, such as a button click, and handle their rejected promises when the browser refuses permission. Fullscreen does not require scene readiness; XR entry requires `state.loaded`.

```ts
fullscreenButton.addEventListener('click', () => {
    viewer.requestFullscreen().catch(showError);
});
vrButton.addEventListener('click', () => {
    viewer.startXR('vr').catch(showError);
});
viewer.events.on('isFullscreen:changed', updateControls);
viewer.events.on('xrMode:changed', updateControls);
```

Native fullscreen targets this viewer's root. Read-only `state.isFullscreen` follows browser entry and exit, including Escape, and the built-in buttons follow host commands. `exitFullscreen()` is a no-op when another element owns fullscreen. Without native fullscreen support, an iframe retains the legacy `requestFullscreen` / `exitFullscreen` parent messages: the promise resolves when sent and `isFullscreen` reports the requested state, because that bridge has no acknowledgement. An unsupported top-level page rejects entry. Automatic entry/exit on orientation changes remains a built-in UI policy; replacement controls choose their own policy.

`state.canStartAR` and `state.canStartVR` report availability on the current renderer. `hasAR` and `hasVR` also include sessions that could work after a WebGL reload. Subscribe to their change events because capability checks can finish after creation. The built-in UI offers the reload prompt; `startXR()` itself never reloads the page and rejects when the current renderer cannot host the session. Browser permission and device availability can still prevent entry.

Read-only `state.xrMode` is `'ar'`, `'vr'` or `null` and follows both API and browser-initiated session exit. `startXR()` resolves when the session starts; it rejects invalid modes and attempts while a session is active, starting or ending. `endXR()` resolves on session exit, is a no-op while idle, and rejects during startup or another pending exit. All four methods reject after destruction; destruction also rejects outstanding API waits. Browser session requests themselves cannot be cancelled, so native XR teardown while a permission request is open still needs device testing.

On standalone headsets (Meta Quest and Pico browsers), sessions render with fixed foveation, a 72 Hz target where supported and a 1 million splat budget, or the `budget` option when it is set. In performance mode they also render at 0.8x resolution, chosen when the session starts. The 2D budget returns when the session ends.

During a session, squeezing both grips, or making fists with tracked hands, drags, turns and scales the scene: about the user's feet in VR, and about their hands in AR. The scene returns to its authored placement when the session ends.

### Restyling

The colours the UI is built from are CSS custom properties on the instance root, so you can
retheme it without replacing anything:

```css
#viewer .sse-viewer {
    --sse-accent: #09f;                 /* highlights, active toggles, the timeline */
    --sse-bkg: #204;                    /* panels; translucent surfaces derive from it */
    --sse-text-light: #fff;
}
```

The full set is `--sse-text`, `--sse-text-light`, `--sse-text-dark`, `--sse-text-darkest`,
`--sse-accent`, `--sse-grip`, `--sse-bkg`, `--sse-bkg-dark`, `--sse-bkg-darkest` and
`--sse-bkg-light`.

For more than a retheme, pass `ui: false`. The viewer creates the canvas and retains core input handling, including keyboard/gamepad input gated by `state.inputEnabled`. It omits the overlay, annotation presentation and built-in controls; render your own controls through the viewer handle. Note that the touch joystick, the fullscreen button and
the AR/VR fallback prompt are part of the UI you are replacing, so those affordances become
yours too. Everything between the two, replacing some of the UI but keeping the rest, is not
supported yet; the class names inside the viewer are not API and do change.

[The custom UI example](https://github.com/playcanvas/supersplat-viewer/blob/main/src/dev/custom-ui.html) demonstrates loading, playback, camera modes, directional movement, annotations, preferences and fullscreen/XR using only the handle and documented state events. Run it locally at `/custom-ui?content=./scene.ply&settings=./settings.json` (`&webgl` selects WebGL). It is a development example, not a React package or a published UI component. Its controls live outside the fullscreen viewer root, so use Escape or the browser's exit affordance to leave fullscreen.

## Rooms and doors

An experience can span several separately scanned scenes ("rooms") connected by doorways. The
first room is the page's own scene. Once the current room has nothing left to stream for the
view, the room behind the nearest door loads in the background, at its coarsest detail level (the
level the page itself waits for before its first reveal); entering a door's `preloadRadius`
switches that background slot to its room. Walking into a door (fly/walk mode) or tapping its
marker fades to black, swaps the room, and fades back in at the arrival pose, with the finer
levels streaming in as after the first reveal. A walk-in keeps the visitor's view relative to the
door: the angle between their view and the direction through the door (along the door box's
thinner horizontal side) is applied to the arrival's forward, and their pitch is kept, so walking
through backwards arrives looking back at the door. A tap arrives at the configured pose, as does
a walk-in through a box as deep as it is wide. A door entered before its room is ready never
fades: the visitor waits in the current room, the marker fills a ring with the download's
progress and names it under the room's name, and the door opens the moment the room is ready. A
walk-in waits while the visitor stands in the doorway (stepping out, or leaving fly/walk mode,
cancels it); a tapped door opens wherever the visitor is by then, and tapping it again cancels.
Loading goes on in the background after a cancel. A room that fails to load, or stops loading
for 30 s, shows its marker dimmed as unavailable with a `console.warn`; approaching its door
afresh or tapping the marker tries again. Orbit mode and XR sessions never trigger a door by
position; the marker can be tapped in any camera mode. A settings file without `rooms` behaves as
before.

Add the optional top-level `rooms` field to the v2 settings. The first entry takes its content
and settings from the page, so it needs no `contentUrl` or `settingsUrl`; if it has them they are ignored.

| Field | Meaning |
| --- | --- |
| `id` | Unique room name, referenced by `to`. |
| `contentUrl` | The room's splat file. Required except for the first room. |
| `settingsUrl` | Optional. The room's own experience settings (annotations, `cameras[0]`, post effects). Missing: no annotations, and the first room's look is reused. |
| `doors[].to` | Destination room id. |
| `doors[].label` | Marker text, shown as written. |
| `doors[].center`, `size` | Axis-aligned trigger box in **this** room's world coordinates (metres; `size` is the full width/height/depth). The marker sits at `center`. |
| `doors[].preloadRadius` | Optional, default 8. Distance from `center` within which the destination takes the background slot over the nearest door's room. |
| `doors[].arrival` | Camera `position` and look-at `target` in the **destination** room's coordinates: where a visitor walking straight through arrives, and what they face. Must lie outside the destination's own door boxes. |

Coordinates are world coordinates as the viewer shows them. The viewer is lenient: invalid entries (unknown `to`,
duplicate `id`, missing `contentUrl` on a non-first room, malformed vectors) are skipped with a
`console.warn` and the rest keeps working, except that an invalid first room disables rooms
altogether. `validateSettings` is strict: it throws on the first such problem instead.

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

Observe `room:changed` to follow the visitor. It fires once when the first scene has loaded (from
`null` to the first room's id, before `state.loaded` turns true; `state.room` is `null` until then),
and then on each door transition while the screen is faded to black: the camera is in the new room
and `viewer.annotations` already returns its list, the old room has not been released yet, and the
fade-in follows. Annotation indices are per room, so refresh any custom annotation UI from
`viewer.annotations` when it fires. The `rooms` member of the global object is internal and not part
of the API.

## Video screens

A screen in the scan (a monitor in a display case, say) can play a video, drawn as an unlit
rectangle a little in front of the scanned picture, with sound placed at the screen through Web
Audio: louder near it, coming from its direction as the visitor turns, silent across the room.
Add the optional top-level `videos` field to the v2 settings; each room's settings file carries
its own list, and a room without the field has no screens.

| Field | Meaning |
| --- | --- |
| `src` | The video file. Relative or http(s). Same-origin, or served with CORS headers: the frames are read into a texture and the sound into Web Audio. |
| `corners` | Four `[x, y, z]` points in viewer world coordinates: top-left, top-right, bottom-right and bottom-left of the picture, as a visitor facing the screen sees them. Any rectangle in space. |
| `offset` | Optional, metres, default `0.01`. The picture is drawn this far in front of the corners, toward the visitor, so the scan's own splats of the screen do not bleed through. |
| `loop` | Optional, default `true`. |
| `playDistance` | Optional, metres, default `20`. Farther than this from the screen's centre the video pauses and stops costing frames; it resumes a little inside. |
| `sound` | Optional. `false` plays the video silent. An object: `volume` (0 to 1, default `1`), `refDistance` (metres, default `1`: full volume up to here, then falling off as one over distance), `fadeDistance` (metres, default `12`: silent from here on, reached over the last 3 m). Omitted: an object with the defaults. |

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

The viewer is lenient: an invalid entry (no `src`, not four corners, a non-finite number, a
`fadeDistance` not above `refDistance`) is skipped with a `console.warn` naming it and the rest
plays. `validateSettings` is strict and throws on the first such problem. A video that cannot be
loaded warns once and leaves no rectangle, so the scan's own picture stays.

The rectangle appears with the video's first decoded frame and is a child of the room's splat
entity, so it follows the scan when it is grabbed or shrunk in XR. The viewer keeps rendering on
demand: a frame is drawn when the video presents a new one, and none while every screen is
paused. Browsers keep sound off until the visitor interacts, so the videos autoplay muted and
their sound starts with the first pointer or key press inside the viewer. `state.muted`
(writable, persisted) silences the screens and the ambient `soundUrl` track; the built-in
settings panel shows a "Sound" switch for it while the current room has either. With rooms, a
door transition stops and unloads the old room's videos before the new room's are built.

The debug panel (`?debug`, Ctrl+Shift+D) has a "Pick screen" button for placing a screen: the
next four clicks on the scene pick the corners in the order above, and the rectangle fitted
through them is written to the console and the clipboard as a `videos` entry with its size in
metres. Pick from close up and straight on; a pick that lands on glass or a reflection shows as a
wrong size.

## Settings

The `/settings` subpath exports the schema types plus helpers for generating, validating and
migrating a `settings.json` file:

```ts
import {
    defaultSettings,
    importSettings,
    validateSettings,
    POST_EFFECT_RANGES,
    type ExperienceSettings
} from '@playcanvas/supersplat-viewer/settings';

// a complete settings object every tool agrees on; pass 'object' to frame a subject
// from outside rather than a captured space from within
const settings: ExperienceSettings = defaultSettings();

// throws on invalid input, naming the offending field
validateSettings(json);

// additionally check the authoring bounds — stricter than what the viewer will render,
// so existing files may fail. Producers writing new settings should enable it
validateSettings(json, { limits: true });

// migrates older versions forward; does not mutate its argument
const migrated = importSettings(json);

// the bounds are data, so an editor UI can drive a slider from the same numbers
const { min, max, step } = POST_EFFECT_RANGES.bloom.intensity;
```

`CAMERA_FOV_RANGE`, `POST_EFFECT_RANGES`, `ANIM_TRACK_LIMITS` and `ANNOTATION_LIMITS` are
exported as data, so an editor UI can drive sliders from the same bounds the validator uses.
They are frozen at runtime.

## Settings Schema

The `settings.json` file uses the schema below (defined in TypeScript and exported from `@playcanvas/supersplat-viewer/settings`). Legacy v1 settings produced by older SuperSplat releases are automatically migrated to v2 on load.

```typescript
type AnimTrack = {
    name: string,
    duration: number,
    frameRate: number,
    loopMode: 'none' | 'repeat' | 'pingpong',
    interpolation: 'step' | 'spline',
    smoothness: number,
    keyframes: {
        times: number[],
        values: {
            position: number[],
            target: number[],
            fov: number[],
        }
    }
};

type CameraPose = {
    position: [number, number, number],
    target: [number, number, number],
    fov: number
};

type Camera = {
    initial: CameraPose
};

type Annotation = {
    position: [number, number, number],
    title: string,
    text: string,
    extras?: any,
    camera: Camera
};

type PostEffectSettings = {
    sharpness: { enabled: boolean, amount: number },
    bloom:     { enabled: boolean, intensity: number, blurLevel: number },
    grading:   { enabled: boolean, brightness: number, contrast: number, saturation: number, tint: [number, number, number] },
    vignette:  { enabled: boolean, intensity: number, inner: number, outer: number, curvature: number },
    fringing:  { enabled: boolean, intensity: number }
};

type ExperienceSettings = {
    version: 2,
    tonemapping: 'none' | 'linear' | 'filmic' | 'hejl' | 'aces' | 'aces2' | 'neutral',
    highPrecisionRendering: boolean,
    soundUrl?: string,
    background: {
        color: [number, number, number],
        skyboxUrl?: string
    },
    postEffectSettings: PostEffectSettings,
    animTracks: AnimTrack[],
    cameras: Camera[],
    annotations: Annotation[],
    rooms?: unknown[],   // doors between scenes: see Rooms and doors
    videos?: unknown[],  // screens playing a video: see Video screens
    startMode: 'default' | 'animTrack' | 'annotation'
};
```

### Example settings.json

```json
{
    "version": 2,
    "tonemapping": "none",
    "highPrecisionRendering": false,
    "background": {
        "color": [0, 0, 0]
    },
    "postEffectSettings": {
        "sharpness": { "enabled": false, "amount": 0 },
        "bloom":     { "enabled": false, "intensity": 0.1, "blurLevel": 2 },
        "grading":   { "enabled": false, "brightness": 1, "contrast": 1, "saturation": 1, "tint": [1, 1, 1] },
        "vignette":  { "enabled": false, "intensity": 0.5, "inner": 0.3, "outer": 0.75, "curvature": 1 },
        "fringing":  { "enabled": false, "intensity": 0.5 }
    },
    "animTracks": [],
    "cameras": [
        {
            "initial": {
                "position": [0, 1, -1],
                "target": [0, 0, 0],
                "fov": 60
            }
        }
    ],
    "annotations": [],
    "startMode": "default"
}
```
