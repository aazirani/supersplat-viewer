import {
    ADDRESS_CLAMP_TO_EDGE,
    CULLFACE_NONE,
    Color,
    Entity,
    Mat4,
    Mesh,
    MeshInstance,
    PIXELFORMAT_RGBA8,
    StandardMaterial,
    Texture,
    Vec3
} from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { playState, retryPlayDue } from './screen-range';
import { screenFrame } from './videos-settings';
import type { VideoDef } from './videos-settings';

/**
 * A video played on a screen in the scan: a quad at the configured corners, pushed a little
 * toward the visitor so the scan's own splats of the screen do not bleed through, showing the
 * video as an unlit texture. The quad is a child of the room's gsplat entity, so it goes where
 * the scan goes (grabbed or shrunk in XR).
 *
 * The quad appears once the first frame has decoded, so a missing or slow video leaves the
 * scan's photo rather than a black panel; a video that fails warns once and leaves no quad.
 * The texture is uploaded only when the video presents a new frame, and each upload asks the
 * app for a frame, so rendering stays on demand.
 *
 * Playback follows the visitor's distance (`setDistance`) and the page's visibility
 * (`setHidden`). Sound is someone else's business (`SpatialAudio`): the element starts muted.
 */
class VideoScreen {
    readonly video: HTMLVideoElement;

    /** The screen's centre in world coordinates. */
    readonly center = new Vec3();

    /** The video could not be loaded or the corners are degenerate: there is no quad. */
    failed = false;

    private app: AppBase;

    private parent: Entity;

    private def: VideoDef;

    private warn: (message: string) => void;

    private entity: Entity | null = null;

    private texture: Texture | null = null;

    private material: StandardMaterial | null = null;

    private mesh: Mesh | null = null;

    // what has been asked of the element, and why
    private playing = false;

    private inRange = false;

    private hidden = false;

    // when a play() was last refused (no gesture yet), for a slow retry rather than one per frame
    private refusedAt: number | null = null;

    private frameHandle: number | null = null;

    private removeUpdate: (() => void) | null = null;

    private destroyed = false;

    private disposers: (() => void)[] = [];

    /**
     * @param app - The app the quad renders in.
     * @param parent - The room's gsplat entity, which the quad is parented to.
     * @param def - The video's settings.
     * @param warn - Reports a video that cannot be shown.
     */
    constructor(app: AppBase, parent: Entity, def: VideoDef, warn: (message: string) => void) {
        this.app = app;
        this.parent = parent;
        this.def = def;
        this.warn = warn;

        const video = document.createElement('video');
        this.video = video;

        const frame = screenFrame(def.corners);
        if (!frame) {
            this.failed = true;
            warn(`video "${def.src}": its corners do not make a rectangle`);
            return;
        }
        this.center.set(frame.center[0], frame.center[1], frame.center[2]);

        // muted so it may autoplay anywhere; inline so iOS does not take it fullscreen; the
        // frames are read into a texture and the sound into Web Audio, which needs cors
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.preload = 'metadata';
        video.loop = def.loop;

        const listen = <K extends keyof HTMLVideoElementEventMap>(
            type: K,
            handler: (event: HTMLVideoElementEventMap[K]) => void
        ) => {
            video.addEventListener(type, handler);
            this.disposers.push(() => video.removeEventListener(type, handler));
        };

        // the quad appears with the first decoded frame
        listen('loadeddata', () => {
            if (this.destroyed || this.entity || this.failed) return;
            this.build(frame.normal);
        });

        listen('error', () => {
            if (this.destroyed) return;
            const message = video.error?.message || 'cannot load';
            this.fail(`video "${def.src}": ${message}`);
        });

        // a paused video presents no frames, and a looping one keeps going on its own
        listen('play', () => this.pump());

        video.src = def.src;
    }

    /** Play or pause for the visitor's distance from the screen, with some hysteresis. */
    setDistance(distance: number) {
        if (this.failed || this.destroyed) return;
        this.inRange = playState(distance, this.def.playDistance, this.inRange);
        this.apply();
    }

    /** Pause while the page is hidden; back in view the distance decides again. */
    setHidden(hidden: boolean) {
        this.hidden = hidden;
        this.apply();
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.stopPump();
        for (const dispose of this.disposers) dispose();
        this.disposers.length = 0;
        const { video } = this;
        video.pause();
        // drops the network connection and the decoder
        video.removeAttribute('src');
        video.load();
        this.teardownQuad();
    }

    private apply() {
        if (this.failed || this.destroyed) return;
        const want = this.inRange && !this.hidden;
        if (want === this.playing) return;
        if (want) {
            // a refused autoplay (a browser that wants a gesture even for a muted video) is
            // retried now and then, until one lets it through
            if (!retryPlayDue(performance.now(), this.refusedAt)) return;
            this.playing = true;
            this.video.play().then(
                () => {
                    this.refusedAt = null;
                },
                () => {
                    this.playing = false;
                    this.refusedAt = performance.now();
                }
            );
        } else {
            this.playing = false;
            this.video.pause();
        }
    }

    // The quad: corners pushed `offset` along the normal, in the parent's local frame.
    private build(normal: [number, number, number]) {
        const { app, def, parent, video } = this;
        const { graphicsDevice } = app;

        const texture = new Texture(graphicsDevice, {
            name: 'video-screen',
            format: PIXELFORMAT_RGBA8,
            mipmaps: false,
            width: video.videoWidth,
            height: video.videoHeight,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        texture.setSource(video);
        this.texture = texture;

        const toLocal = new Mat4().copy(parent.getWorldTransform()).invert();
        const n = new Vec3(normal[0], normal[1], normal[2]);
        const positions: number[] = [];
        const point = new Vec3();
        for (const corner of def.corners) {
            point.set(corner[0], corner[1], corner[2]).add(n.clone().mulScalar(def.offset));
            toLocal.transformPoint(point, point);
            positions.push(point.x, point.y, point.z);
        }

        const mesh = new Mesh(graphicsDevice);
        mesh.setPositions(positions);
        // top-left, top-right, bottom-right, bottom-left; the texture's first row is the top
        mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
        mesh.setIndices([0, 3, 2, 0, 2, 1]);
        mesh.update();
        this.mesh = mesh;

        const material = new StandardMaterial();
        material.useLighting = false;
        material.diffuse = new Color(0, 0, 0);
        material.emissive = new Color(1, 1, 1);
        material.emissiveMap = texture;
        material.cull = CULLFACE_NONE;
        material.update();
        this.material = material;

        const entity = new Entity('video-screen', app);
        entity.addComponent('render', { meshInstances: [new MeshInstance(mesh, material)] });
        parent.addChild(entity);
        this.entity = entity;

        texture.upload();
        app.renderNextFrame = true;
        if (this.playing) this.pump();
    }

    // Uploads each presented frame. Browsers without requestVideoFrameCallback upload on every
    // app update while the video plays.
    private pump() {
        if (this.destroyed || !this.texture || this.frameHandle !== null || this.removeUpdate) return;
        const { video, app } = this;
        // checked without narrowing `video`, which the else branch still uses
        const hasFrameCallback = typeof video.requestVideoFrameCallback === 'function';
        if (hasFrameCallback) {
            const onFrame = () => {
                this.frameHandle = null;
                if (this.destroyed || !this.texture) return;
                this.texture.upload();
                app.renderNextFrame = true;
                this.frameHandle = video.requestVideoFrameCallback(onFrame);
            };
            this.frameHandle = video.requestVideoFrameCallback(onFrame);
        } else {
            const onUpdate = () => {
                if (this.destroyed || !this.texture || video.paused || video.readyState < 2) return;
                this.texture.upload();
                app.renderNextFrame = true;
            };
            app.on('update', onUpdate);
            this.removeUpdate = () => app.off('update', onUpdate);
        }
    }

    private stopPump() {
        if (this.frameHandle !== null) {
            this.video.cancelVideoFrameCallback(this.frameHandle);
            this.frameHandle = null;
        }
        this.removeUpdate?.();
        this.removeUpdate = null;
    }

    private fail(message: string) {
        this.failed = true;
        this.warn(message);
        this.stopPump();
        this.video.pause();
        this.playing = false;
        this.teardownQuad();
        this.app.renderNextFrame = true;
    }

    private teardownQuad() {
        this.entity?.destroy();
        this.entity = null;
        this.material?.destroy();
        this.material = null;
        this.mesh?.destroy();
        this.mesh = null;
        this.texture?.destroy();
        this.texture = null;
    }
}

export { VideoScreen };
