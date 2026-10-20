// How a screen's sound and playback depend on the visitor's distance from it. Pure, so Node can
// run it in tests.

import type { SoundDef } from './videos-settings';

// the sound reaches silence over this many metres before `fadeDistance`
const FADE_LENGTH = 3;

// a playing video keeps playing until this far beyond `playDistance`, so a visitor standing at
// the edge does not flicker it
const PAUSE_FACTOR = 1.1;

/**
 * The gain for a screen's sound at `distance` metres: the volume up to the reference distance,
 * falling off as one over distance, and fading linearly to nothing over the last metres before
 * `fadeDistance`, after which it is silent whatever the panner would carry through walls.
 */
const soundLevel = (distance: number, sound: SoundDef): number => {
    const { volume, refDistance, fadeDistance } = sound;
    const rolloff = Math.min(1, refDistance / Math.max(distance, 1e-6));
    const fade = Math.min(1, Math.max(0, (fadeDistance - distance) / FADE_LENGTH));
    return volume * rolloff * fade;
};

/**
 * Whether a video should play at `distance`: yes inside `playDistance`, and a playing one keeps
 * going until a tenth beyond it.
 */
const playState = (distance: number, playDistance: number, playing: boolean): boolean =>
    distance <= (playing ? playDistance * PAUSE_FACTOR : playDistance);

export { FADE_LENGTH, PAUSE_FACTOR, playState, soundLevel };
