# Graph Report - supersplat-viewer  (2026-10-19)

## Corpus Check
- 128 files · ~146,518 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .scss 1)

## Summary
- 1330 nodes · 2877 edges · 73 communities (57 shown, 16 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.82)
- Token cost: 41,000 input · 9,500 output

## Community Hubs (Navigation)
- Depth Surface Picking
- Settings Defaults and Schemas
- Camera Manager
- Frame Capture
- API Docs and CI
- Sorting Shaders WGSL
- Stochastic Renderer Culling
- Navigation Cursor
- Camera Math Utilities
- Camera Frame Navigation
- XR Hand Gestures
- Viewer Bootstrap Loading
- Package Manifest
- Rollup Build Config
- Sphere Mover Collision
- Voxel Collision Queries
- Peripheral Input Devices
- HTML UI Controls
- XR Grab Move
- Navigation Interaction
- TAA and Motion Warp
- Dev Dependencies
- Cursor Animation
- Camera Controller Modes
- Direct Splat Source
- Order Projector Compute
- Splat Raster Passes
- Walk Controller
- XR Head Menu
- Camera Track Builders
- Mesh BVH Collision
- Localization
- Controls Hints UI
- Viewer HTML Renderer
- Mesh Collision Queries
- Keyboard Mouse Input
- Unit Tests
- Input Controller
- XR Teleport
- npm Scripts
- Pointer Lock
- XR Menu Haptics
- WorkBuffer Splat Source
- Camera Math
- Collision Resolution
- Splat Source Interface
- TypeScript Config
- PlayCanvas XR Scripts
- Fly Controller
- Engine Interface Types
- Splat View Resources
- Mesh Debug Overlay
- Engine Work Buffer
- Annotations
- Menu Canvas Drawing
- Packed Splat Source
- Annotation Tooltips
- Module Exports
- Keyboard Mode Shortcuts
- Resident Set Provider
- Input Move Control
- Trackpad Device
- Tooltip System
- XR Depth Clear
- Flipped Voxel Collision
- Renovate Config
- App Factory
- Voxel Debug Overlay
- Lint Format Config
- Peer Dependencies
- Repository Metadata
- Release Script
- CI Lint Job

## God Nodes (most connected - your core abstractions)
1. `StochasticSplatRenderer` - 63 edges
2. `playcanvas` - 54 edges
3. `Global` - 41 edges
4. `Camera` - 38 edges
5. `VoxelCollision` - 37 edges
6. `DebugPanel` - 35 edges
7. `Viewer` - 35 edges
8. `DirectSplatSource` - 34 edges
9. `createViewer()` - 31 edges
10. `Collision` - 30 edges

## Surprising Connections (you probably didn't know these)
- `capture` --semantically_similar_to--> `captureFrame`  [INFERRED] [semantically similar]
  src/dev/bench.html → docs/api.md
- `Stochastic Renderer` --conceptually_related_to--> `Renderer Bench Harness (bench.html)`  [INFERRED]
  README.md → src/dev/bench.html
- `CI Build Job` --references--> `SuperSplat Viewer`  [EXTRACTED]
  .github/workflows/ci.yml → README.md
- `Publish Workflow Job` --references--> `SuperSplat Viewer`  [EXTRACTED]
  .github/workflows/publish.yml → README.md
- `Standalone Viewer Document (index.html)` --implements--> `URL Parameters`  [INFERRED]
  src/index.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Viewer Handle API Surface** — docs_api_createviewer, docs_api_viewer_handle, docs_api_captureframe, docs_api_seek, docs_api_selectannotation, docs_api_setmoveinput, docs_api_camera_commands, docs_api_xr_commands, docs_api_destroy [EXTRACTED 1.00]
- **createViewer Embedding Consumers** — src_index_standalone_document, src_dev_bench_loadviewer, src_dev_custom_ui_custom_controls_example, src_dev_mount_loop_teardown_harness [EXTRACTED 1.00]
- **Settings Toolchain** — docs_api_defaultsettings, docs_api_validatesettings, docs_api_importsettings, docs_api_post_effect_ranges, docs_api_experiencesettings [EXTRACTED 1.00]

## Communities (73 total, 16 thin omitted)

### Community 0 - "Depth Surface Picking"
Cohesion: 0.07
Nodes (43): clampPixel(), createPickCameraSnapshot(), DepthAt, estimateSurface(), farColor, fitPlaneNormal(), fitPlaneOnce(), float32 (+35 more)

### Community 1 - "Settings Defaults and Schemas"
Cohesion: 0.09
Nodes (51): CameraFit, DEFAULT_BACKGROUND_COLOR, defaultCameraPose(), defaultPostEffectSettings(), defaultSettings(), ANIM_TRACK_LIMITS, AnimTrackLimits, ANNOTATION_LIMITS (+43 more)

### Community 2 - "Camera Manager"
Cohesion: 0.07
Nodes (13): CameraManager, settleFrom(), CameraStateSnapshot, captureCameraState(), restoreCameraState(), DebugPanel, fmt(), MiniStatsSwitch (+5 more)

### Community 3 - "Frame Capture"
Cohesion: 0.08
Nodes (20): Capture, nearlyEquals(), FrameGate, GpuQueue, initFullscreen(), createViewer(), initCanvas(), measureCanvas() (+12 more)

### Community 4 - "API Docs and CI"
Cohesion: 0.07
Nodes (44): CI Build Job, Publish Workflow Job, AnimTrack, Annotation, API Reference (docs/api.md), Camera Commands (frameScene / resetCamera / toggleWalk), captureFrame, createViewer (+36 more)

### Community 5 - "Sorting Shaders WGSL"
Cohesion: 0.06
Nodes (15): defaultVariant(), EngineDevice, EngineForwardRenderer, EYES_PARALLEL_COS, MODE_VARIANTS, parseVariant(), StochasticMode, StochasticRendererOptions (+7 more)

### Community 6 - "Stochastic Renderer Culling"
Cohesion: 0.10
Nodes (5): captureCameraSnapshot(), ResidentSet, cacheBytesFit(), eyesShareDepth(), StochasticSplatRenderer

### Community 7 - "Navigation Cursor"
Cohesion: 0.09
Nodes (16): bitangent, buildBezierRing(), CursorRing, CursorTarget, NavCursor, NORMAL_SNAP_DIRECTIONS, right, snapNormal() (+8 more)

### Community 8 - "Camera Math Utilities"
Cohesion: 0.09
Nodes (22): applyFrameRotation(), dampAngles(), rotation, setBasisOffset(), setCameraBasis(), setYawBasis(), clearProbe, forward (+14 more)

### Community 9 - "Camera Frame Navigation"
Cohesion: 0.14
Nodes (18): CameraFrame, setCameraForward(), FlySource, forward, getStopDistance(), postTurnAngles, toTarget, approach() (+10 more)

### Community 10 - "XR Hand Gestures"
Cohesion: 0.09
Nodes (17): axisX, axisY, axisZ, boneA, boneB, foldedFingers(), frame, handOf() (+9 more)

### Community 11 - "Viewer Bootstrap Loading"
Cohesion: 0.12
Nodes (22): CaptureFrame, CaptureResult, GrabOptions, observe(), contentName(), createImage(), isPrefetchable(), loadGsplat() (+14 more)

### Community 12 - "Package Manifest"
Cohesion: 0.08
Nodes (25): author, bugs, url, description, engines, node, files, homepage (+17 more)

### Community 13 - "Rollup Build Config"
Cohesion: 0.08
Nodes (21): autoprefixer, postcss, rollup-plugin-dts, @rollup/plugin-json, @rollup/plugin-node-resolve, rollup-plugin-scss, rollup-plugin-string, @rollup/plugin-typescript (+13 more)

### Community 14 - "Sphere Mover Collision"
Cohesion: 0.11
Nodes (14): collisionPush, pushOut, remainingMove, SphereMover, SWEEP_RAY_OFFSETS, sweepBitangent, sweepDir, SweepHit (+6 more)

### Community 15 - "Voxel Collision Queries"
Cohesion: 0.11
Nodes (4): PushOut, popcount(), scoreSurfaceCandidate(), VoxelCollision

### Community 16 - "Peripheral Input Devices"
Cohesion: 0.14
Nodes (18): stickMove, stickRotate, tmpV, flyRotate, orbitMove, orbitRotate, pinchMoveTmp, tmpV (+10 more)

### Community 17 - "HTML UI Controls"
Cohesion: 0.17
Nodes (13): ViewerHandle, XrMode, initAnnotationControls(), initCameraControls(), readOpen(), writeOpen(), initFullscreenControls(), getGpuName() (+5 more)

### Community 18 - "XR Grab Move"
Cohesion: 0.14
Nodes (13): delta, grabbed, left, mid, position, right, rigInverse, rotateY() (+5 more)

### Community 19 - "Navigation Interaction"
Cohesion: 0.18
Nodes (5): canTargetFly(), computeClickSpeedMul(), NavInteraction, PickTarget, tmpV

### Community 20 - "TAA and Motion Warp"
Cohesion: 0.12
Nodes (10): analyticWarpMap(), buildWarpTable(), coordinateOf(), WarpMap, GpuBuffer, GpuDevice, GpuPass, measureXrRateMaps() (+2 more)

### Community 21 - "Dev Dependencies"
Cohesion: 0.10
Nodes (20): devDependencies, autoprefixer, concurrently, eslint, globals, playcanvas, @playcanvas/eslint-config, postcss (+12 more)

### Community 22 - "Cursor Animation"
Cohesion: 0.17
Nodes (3): AnimCursor, AnimState, CubicSpline

### Community 23 - "Camera Controller Modes"
Cohesion: 0.18
Nodes (6): AnimController, Camera, CameraController, drainInputFrame(), OrbitController, p

### Community 25 - "Order Projector Compute"
Cohesion: 0.16
Nodes (8): CoverageMode, footprintEye1WGSL(), occlusionWGSL(), permutations, polygonScale(), projectorWGSL(), SET_BUCKETS, warpEye1WGSL

### Community 26 - "Splat Raster Passes"
Cohesion: 0.11
Nodes (5): createFullscreenMesh(), createPolygonMesh(), createQuadMesh(), SplatBindPass, SplatRasterPass

### Community 27 - "Walk Controller"
Cohesion: 0.19
Nodes (6): WalkController, Collision, findCylinderSpawn(), findSphereSpawn(), scratchPush, SpawnOut

### Community 29 - "Camera Track Builders"
Cohesion: 0.20
Nodes (11): playcanvas, createFigure8Track(), createRotateTrack(), createCamera(), createFrameCamera(), isWalkableSize(), isWalkAllowed(), tmpCamera (+3 more)

### Community 30 - "Mesh BVH Collision"
Cohesion: 0.14
Nodes (14): buildBVH(), BVHNode, _closest, closestPointOnSegment(), closestPointOnTriangle(), closestSegmentTriangle(), computeTriangleBounds(), _segClosest (+6 more)

### Community 31 - "Localization"
Cohesion: 0.13
Nodes (6): detectLocale(), dictionaries, Dictionary, initLocalization(), Localize, initVrPrompt()

### Community 32 - "Controls Hints UI"
Cohesion: 0.17
Nodes (16): describe(), Hint, icons, initControlsHint(), isGaming(), key(), mouse(), MouseButton (+8 more)

### Community 33 - "Viewer HTML Renderer"
Cohesion: 0.21
Nodes (8): escapeAttribute(), indent(), jsonForScriptBlock(), renderViewerHtml(), RenderViewerHtmlOptions, replaceOnce(), Replacer, ViewerBootstrap

### Community 34 - "Mesh Collision Queries"
Cohesion: 0.18
Nodes (4): MeshCollision, rayAABB(), rayTriangle(), sphereAABBOverlap()

### Community 35 - "Keyboard Mouse Input"
Cohesion: 0.13
Nodes (10): flyKeyVelocity, KeyboardInternals, KeyboardMouseDevice, keyMove, mouseRotate, panMove, patchKeyboardMeta(), tmpV1 (+2 more)

### Community 36 - "Unit Tests"
Cohesion: 0.16
Nodes (3): pkg, read(), url()

### Community 37 - "Input Controller"
Cohesion: 0.21
Nodes (4): InputModeTracker, GamepadDevice, TouchDevice, Global

### Community 38 - "XR Teleport"
Cohesion: 0.19
Nodes (6): blockMask, buildFloorPatch(), TeleportTarget, standaloneHeadset, replaceTeleportArc(), TeleportArcNavigation

### Community 39 - "npm Scripts"
Cohesion: 0.14
Nodes (14): scripts, build, develop, fmt, fmt:fix, lint, lint:fix, publint (+6 more)

### Community 40 - "Pointer Lock"
Cohesion: 0.30
Nodes (3): hasUserActivation(), isCaptureMode(), PointerLockManager

### Community 41 - "XR Menu Haptics"
Cohesion: 0.14
Nodes (12): approach(), HapticGamepad, ICON_POSITION, inverse, localDirection, localOrigin, off(), Press (+4 more)

### Community 43 - "Camera Math"
Cohesion: 0.21
Nodes (6): avec, bvec, rotation, easeOut(), mod(), vecToAngles()

### Community 44 - "Collision Resolution"
Cohesion: 0.24
Nodes (5): RayHit, resolveIterative(), loadVoxelCollision(), SURFACE_CANDIDATES, VoxelMetadata

### Community 45 - "Splat Source Interface"
Cohesion: 0.21
Nodes (5): ResidentNode, DispatchGroup, SplatSource, SplatSourceFactory, SplatSourceKind

### Community 46 - "TypeScript Config"
Cohesion: 0.17
Nodes (11): compilerOptions, inlineSources, lib, module, moduleResolution, noImplicitAny, resolveJsonModule, sourceMap (+3 more)

### Community 47 - "PlayCanvas XR Scripts"
Cohesion: 0.18
Nodes (8): *.css, *.html, *.js, playcanvas/scripts/esm/xr/xr-controllers.mjs, playcanvas/scripts/esm/xr/xr-manipulation.mjs, playcanvas/scripts/esm/xr/xr-navigation.mjs, Window, XrManipulation

### Community 49 - "Engine Interface Types"
Cohesion: 0.18
Nodes (10): buildResidentSet(), EngineDirector, EngineFormat, EngineOctreeNode, EngineRenderer, EngineSplatInfo, EngineWorldState, FrameCallback (+2 more)

### Community 51 - "Mesh Debug Overlay"
Cohesion: 0.31
Nodes (5): TriangleSoA, buildFlatMesh(), encodeFlatColors(), makeSurfaceMaterial(), MeshDebugOverlay

### Community 53 - "Annotations"
Cohesion: 0.29
Nodes (3): AnnotationContext, vec, Annotations

### Community 54 - "Menu Canvas Drawing"
Cohesion: 0.38
Nodes (3): ease(), lerp(), roundRect()

### Community 55 - "Packed Splat Source"
Cohesion: 0.25
Nodes (5): ResidentFile, packedReadWGSL(), FileConstants, tmpRotation, tmpScale

### Community 57 - "Module Exports"
Cohesion: 0.25
Nodes (8): exports, ./settings, ./viewer, ./viewer.css, import, types, import, types

### Community 58 - "Keyboard Mode Shortcuts"
Cohesion: 0.36
Nodes (4): isCaptureMode(), isWasdKey(), ModeShortcuts, shortcutKey()

### Community 63 - "XR Depth Clear"
Cohesion: 0.29
Nodes (6): EngineDevice, EngineXr, GpuBinding, GpuSubImage, GpuTexture, initXrDepthClear()

### Community 65 - "Renovate Config"
Cohesion: 0.40
Nodes (4): config:recommended, extends, packageRules, $schema

### Community 66 - "App Factory"
Cohesion: 0.40
Nodes (3): App, AppConstructorOptions, createApp()

### Community 69 - "Peer Dependencies"
Cohesion: 0.67
Nodes (3): peerDependenciesMeta, playcanvas, optional

### Community 70 - "Repository Metadata"
Cohesion: 0.67
Nodes (3): repository, type, url

## Knowledge Gaps
- **299 isolated node(s):** `name`, `author`, `homepage`, `description`, `keywords` (+294 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 460 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `playcanvas` connect `Camera Track Builders` to `Depth Surface Picking`, `Camera Manager`, `Frame Capture`, `Sorting Shaders WGSL`, `Navigation Cursor`, `Camera Math Utilities`, `Camera Frame Navigation`, `XR Hand Gestures`, `Viewer Bootstrap Loading`, `Package Manifest`, `Sphere Mover Collision`, `Peripheral Input Devices`, `HTML UI Controls`, `XR Grab Move`, `Navigation Interaction`, `Cursor Animation`, `Camera Controller Modes`, `Mesh BVH Collision`, `Keyboard Mouse Input`, `Input Controller`, `XR Teleport`, `XR Menu Haptics`, `Camera Math`, `Collision Resolution`, `Splat Source Interface`, `Engine Interface Types`, `Mesh Debug Overlay`, `Annotations`, `Packed Splat Source`, `XR Depth Clear`, `App Factory`?**
  _High betweenness centrality (0.279) - this node is a cross-community bridge._
- **Why does `StochasticSplatRenderer` connect `Stochastic Renderer Culling` to `Depth Surface Picking`, `Camera Manager`, `Frame Capture`, `Sorting Shaders WGSL`, `XR Teleport`, `Splat Source Interface`, `Splat View Resources`, `TAA and Motion Warp`, `Order Projector Compute`, `Splat Raster Passes`, `Resident Set Provider`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `Global` connect `Input Controller` to `Camera Manager`, `Frame Capture`, `Keyboard Mouse Input`, `XR Teleport`, `Pointer Lock`, `Viewer Bootstrap Loading`, `Peripheral Input Devices`, `HTML UI Controls`, `Navigation Interaction`, `Trackpad Device`, `Keyboard Mode Shortcuts`, `Input Move Control`, `Camera Track Builders`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **What connects `name`, `author`, `homepage` to the rest of the system?**
  _299 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Depth Surface Picking` be split into smaller, more focused modules?**
  _Cohesion score 0.07191961924907457 - nodes in this community are weakly interconnected._
- **Should `Settings Defaults and Schemas` be split into smaller, more focused modules?**
  _Cohesion score 0.09148598625066102 - nodes in this community are weakly interconnected._
- **Should `Camera Manager` be split into smaller, more focused modules?**
  _Cohesion score 0.07380520266182698 - nodes in this community are weakly interconnected._