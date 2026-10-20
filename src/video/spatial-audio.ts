import type { Entity } from 'playcanvas';

import { soundLevel } from './screen-range';
import type { VideoScreen } from './video-screen';
import type { SoundDef } from './videos-settings';

type Channel = {
    source: MediaElementAudioSourceNode;
    gain: GainNode;
    panner: PannerNode;
    sound: SoundDef;
};

// Writes a Web Audio position or orientation, through the params where the browser has them
// and the legacy setters where not (older Safari).
const setParam = (param: AudioParam | undefined, value: number) => {
    if (param) param.value = value;
};

/**
 * The scene's sound: each video screen's sound placed at its screen through a Web Audio panner,
 * with the listener following the camera, plus the settings' ambient `soundUrl` track. One
 * audio context per viewer.
 *
 * Browsers keep sound off until the visitor interacts, so the context starts suspended and the
 * videos muted; the first pointer or key press inside the viewer unlocks both. Distance does
 * the attenuation (`soundLevel`, which reaches silence), the panner only the direction.
 * `setMuted` silences everything for a visitor who wants quiet.
 */
class SpatialAudio {
    /** Whether the visitor's first interaction has let sound through. */
    unlocked = false;

    private root: HTMLElement;

    private warn: (message: string) => void;

    private ctx: AudioContext | null = null;

    private ctxFailed = false;

    private channels = new Map<VideoScreen, Channel>();

    private ambientTrack: HTMLAudioElement | null = null;

    private muted = false;

    private hidden = false;

    private removeUnlock: () => void;

    private destroyed = false;

    /**
     * @param root - The viewer's root element, whose first interaction unlocks the sound.
     * @param warn - Reports a browser without Web Audio.
     */
    constructor(root: HTMLElement, warn: (message: string) => void) {
        this.root = root;
        this.warn = warn;

        const unlock = () => {
            this.removeUnlock();
            this.unlocked = true;
            this.ctx?.resume().catch((): void => undefined);
            this.applyMute();
            this.applyAmbient();
        };
        const options = { capture: true, once: true };
        root.addEventListener('pointerdown', unlock, options);
        root.addEventListener('keydown', unlock, options);
        this.removeUnlock = () => {
            root.removeEventListener('pointerdown', unlock, options);
            root.removeEventListener('keydown', unlock, options);
        };
    }

    /** Place a screen's sound at its centre. A screen is attached once. */
    attach(screen: VideoScreen, sound: SoundDef) {
        if (this.destroyed || this.channels.has(screen)) return;
        const ctx = this.context();
        if (!ctx) return;

        const { center } = screen;
        const source = ctx.createMediaElementSource(screen.video);
        const gain = new GainNode(ctx, { gain: 0 });
        const panner = new PannerNode(ctx, {
            panningModel: 'HRTF',
            // the direction only: the gain carries the distance
            distanceModel: 'inverse',
            refDistance: 1,
            rolloffFactor: 0
        });
        if (panner.positionX) {
            panner.positionX.value = center.x;
            panner.positionY.value = center.y;
            panner.positionZ.value = center.z;
        } else {
            panner.setPosition(center.x, center.y, center.z);
        }
        source.connect(gain).connect(panner).connect(ctx.destination);
        this.channels.set(screen, { source, gain, panner, sound });
        screen.video.muted = !this.unlocked || this.muted;
    }

    detach(screen: VideoScreen) {
        const channel = this.channels.get(screen);
        if (!channel) return;
        this.channels.delete(screen);
        channel.source.disconnect();
        channel.gain.disconnect();
        channel.panner.disconnect();
    }

    /** The ambient track for the current room, or none. Replaces the previous one. */
    ambient(url: string | null) {
        const previous = this.ambientTrack;
        if (previous) {
            previous.pause();
            previous.removeAttribute('src');
            previous.load();
            this.ambientTrack = null;
        }
        if (!url || this.destroyed) return;
        const track = new Audio(url);
        track.crossOrigin = 'anonymous';
        track.loop = true;
        track.muted = this.muted;
        this.ambientTrack = track;
        this.applyAmbient();
    }

    /** Silence the screens and the ambient track, or let them through again. */
    setMuted(muted: boolean) {
        this.muted = muted;
        this.applyMute();
    }

    /** Pause the ambient track while the page is hidden. The screens pause themselves. */
    setHidden(hidden: boolean) {
        this.hidden = hidden;
        this.applyAmbient();
    }

    /** Follow the camera and set each screen's level for its distance. Called every update. */
    update(camera: Entity, distances: ReadonlyMap<VideoScreen, number>) {
        const ctx = this.ctx;
        if (!ctx || this.destroyed) return;
        if (this.channels.size === 0) return;

        const { listener } = ctx;
        const position = camera.getPosition();
        const { forward, up } = camera;
        if (listener.positionX) {
            setParam(listener.positionX, position.x);
            setParam(listener.positionY, position.y);
            setParam(listener.positionZ, position.z);
            setParam(listener.forwardX, forward.x);
            setParam(listener.forwardY, forward.y);
            setParam(listener.forwardZ, forward.z);
            setParam(listener.upX, up.x);
            setParam(listener.upY, up.y);
            setParam(listener.upZ, up.z);
        } else {
            listener.setPosition(position.x, position.y, position.z);
            listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
        }

        for (const [screen, channel] of this.channels) {
            const distance = distances.get(screen);
            channel.gain.gain.value = this.muted || distance === undefined ? 0 : soundLevel(distance, channel.sound);
        }
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.removeUnlock();
        for (const screen of [...this.channels.keys()]) this.detach(screen);
        this.ambient(null);
        this.ctx?.close().catch((): void => undefined);
        this.ctx = null;
    }

    private context(): AudioContext | null {
        if (this.ctx || this.ctxFailed) return this.ctx;
        try {
            this.ctx = new AudioContext();
            if (this.unlocked) this.ctx.resume().catch((): void => undefined);
        } catch (err) {
            this.ctxFailed = true;
            this.warn(
                `sound: no audio context (${err instanceof Error ? err.message : String(err)}); the videos play silent`
            );
        }
        return this.ctx;
    }

    private applyMute() {
        const muted = !this.unlocked || this.muted;
        for (const screen of this.channels.keys()) screen.video.muted = muted;
        if (this.ambientTrack) this.ambientTrack.muted = this.muted;
    }

    private applyAmbient() {
        const track = this.ambientTrack;
        if (!track) return;
        if (this.hidden || !this.unlocked) {
            track.pause();
        } else {
            track.play().catch((): void => undefined);
        }
    }
}

export { SpatialAudio };
