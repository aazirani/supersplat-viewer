# SuperSplat Viewer

[![NPM Version](https://img.shields.io/npm/v/@playcanvas/supersplat-viewer)](https://www.npmjs.com/package/@playcanvas/supersplat-viewer)
[![NPM Downloads](https://img.shields.io/npm/dw/@playcanvas/supersplat-viewer)](https://npmtrends.com/@playcanvas/supersplat-viewer)
[![License](https://img.shields.io/npm/l/@playcanvas/supersplat-viewer)](https://github.com/playcanvas/supersplat-viewer/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white&color=black)](https://discord.gg/RSaMRzg)
[![Reddit](https://img.shields.io/badge/Reddit-FF4500?style=flat&logo=reddit&logoColor=white&color=black)](https://www.reddit.com/r/PlayCanvas)
[![X](https://img.shields.io/badge/X-000000?style=flat&logo=x&logoColor=white&color=black)](https://x.com/intent/follow?screen_name=playcanvas)

| [User Manual](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/import-export/#html-viewer-htmlzip) | [Blog](https://blog.playcanvas.com) | [Forum](https://forum.playcanvas.com) |

This is the official viewer for [SuperSplat](https://superspl.at).

<img width="1114" height="739" alt="supersplat-viewer" src="https://github.com/user-attachments/assets/15d2c654-9484-4265-a279-99acb65e38c9" />

The web app compiles to a simple, self-contained static website.

## URL Parameters

The app supports a number of URL parameters (these are subject to change):

### Content

| Parameter   | Description                                                                               | Default                  |
| ----------- | ----------------------------------------------------------------------------------------- | ------------------------ |
| `settings`  | URL of the `settings.json` file                                                           | `./settings.json`        |
| `content`   | URL of the scene file (`.ply`, `.sog`, `.compressed.ply`, `.meta.json`, `.lod-meta.json`) | `./scene.compressed.ply` |
| `skybox`    | URL of an equirectangular skybox image                                                    |                          |
| `poster`    | URL of an image to show while loading                                                     |                          |
| `collision` | URL of a collision asset (`.glb` mesh, or voxel data). `voxel` is accepted as an alias.   |                          |

### UI

| Parameter    | Description                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `noui`       | Hide the UI overlay (the programmatic form is `ui: false`, which skips building it)                                       |
| `reticle`    | Show the centre reticle in captured desktop fly/walk mode (off by default; programmatic form: `reticle: true`)            |
| `noanim`     | Start with animation paused                                                                                               |
| `ministats`  | Show runtime CPU/GPU performance graphs                                                                                   |
| `lang`       | Override the UI language (`de`, `en`, `es`, `fa`, `fr`, `ja`, `ko`, `pt-BR`, `ru`, `zh-CN`; default: detect from browser) |
| `annotation` | Fly to the annotation with this number once loaded (`annotation=3` for hotspot 3), e.g. for a QR code beside an exhibit. With rooms, the first room's exhibits unless `room` names another |
| `room` | Start in this room of a multi-room experience (`room=tunnel`): once loaded, the viewer goes through the first room's door to it, and `annotation` then counts that room's exhibits |

### Site language

To show every visitor the same language whatever their browser's, set `lang` in the settings block of the `index.html` you deploy, replacing its `null`:

```html
<script type="application/json" id="sse-bootstrap">
    { "lang": "fa" }
</script>
```

A link's `?lang=en` or `?lang=fa` still overrides it. Without it, the language follows the browser. Embedders set the same through `renderViewerHtml({ bootstrap: { lang: 'fa' } })` or `createViewer({ defaultLang: 'fa' })`.

### Annotation links

Annotation text may hold links, opened in a panel beside the scene: a bare `https://…` url becomes a "More info" button, and `[label](url)` links a word in a sentence. The page runs in a sandboxed frame; a page served from the viewer's own origin gets an opaque origin there, so its fonts and data files need `Access-Control-Allow-Origin: *` headers (see the [API reference](docs/api.md#controlling-annotations)). Text in Persian, Arabic or Hebrew reads right to left, in the bundled [Vazirmatn](https://github.com/rastikerdar/vazirmatn) font (SIL Open Font License, `src/fonts/Vazirmatn-OFL.txt`).

### Video screens

A scanned display screen can play a real video, with sound that comes from the screen and fades with distance. Add a `videos` list to `settings.json` (see the [API reference](docs/api.md#video-screens)): the video file, the four corners of the picture in the scan, and optional sound settings. The video must come from the same origin as the page or be served with CORS headers, since its frames are read into a texture and its sound into Web Audio. It plays muted until the visitor's first click, tap or key press, as browsers require; the settings panel then offers a "Sound" switch, remembered across visits, that silences the screens and the ambient `soundUrl` track. Far from a screen the video pauses, so it costs nothing while the visitor is elsewhere.

To place a screen, open the debug panel (`?debug`, or Ctrl+Shift+D), press "Pick screen" and click the picture's four corners from close up and straight on, top-left first and clockwise. The fitted rectangle is written to the console and the clipboard as a `videos` entry, with its size, so a pick that landed on the case's glass or a reflection shows up as a wrong size; pick again if so, and adjust `offset` until the scan's own picture no longer shows through.

### Renderer

By default the viewer uses WebGPU when available (falling back automatically when not). The flag below forces the WebGL renderer (also required for WebXR / AR / VR):

| Parameter     | Description                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webgl`       | Force the WebGL renderer (required for AR/VR)                                                                                                                                    |
| `aa`          | Enable antialiasing (WebGL only)                                                                                                                                                 |
| `stochastic`  | Experimental unsorted, depth-tested splat renderer: `stochastic` for per-pixel quality, `stochastic=mobile` for phones and headsets. WebGPU only, its XR included                |
| `splatSource` | Developer knob for the stochastic renderer: the data path feeding it (`direct`, the default, reads the resident files in place; `workbuffer` reads the engine's work buffer)     |
| `variant`     | Developer knob for the stochastic renderer: comma-separated `key:value` experiment switches over the mode's, e.g. `taaSharp:8`                                                   |
| `nofx`        | Disable post effects                                                                                                                                                             |
| `hpr`         | Override `highPrecisionRendering` from settings (`?hpr`, `?hpr=1`, `?hpr=true`, `?hpr=enable` to enable)                                                                         |
| `budget`      | Override the splat budget, in millions of splats                                                                                                                                 |
| `colorize`    | Render with LOD colorization                                                                                                                                                     |
| `fullload`    | Load all streaming LOD data before the first frame                                                                                                                               |
| `heatmap`     | Use heatmap mode for the voxel collision debug overlay. Requires WebGPU and voxel collision data; press `V` or use **Show Collision** in the settings panel to show the overlay. |
| `debug`       | Open the developer debug panel on load (`Ctrl+Shift+D` to toggle)                                                                                                                |

## NPM Package

See the [API reference](docs/api.md) for embedding, runtime control, UI customization and settings.

## Local Development

To initialize a local development environment for SuperSplat Viewer, ensure you have [Node.js](https://nodejs.org/) 20 or later installed. Follow these steps:

1. Clone the repository:

    ```sh
    git clone https://github.com/playcanvas/supersplat-viewer.git
    cd supersplat-viewer
    ```

2. Install dependencies:

    ```sh
    npm install
    ```

3. Start the development build and local web server:

    ```sh
    npm run develop
    ```

4. Open your browser at http://localhost:3000.

### Debug engine build

By default the viewer links against the release build of the PlayCanvas engine. Set `ENGINE=debug` to link against the engine's debug build instead, which includes runtime assertions and unminified, readable source for easier debugging:

```sh
ENGINE=debug npm run develop
```

This also works with `npm run build` and `npm run watch`.
