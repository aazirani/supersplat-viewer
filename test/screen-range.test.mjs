import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build: Node strips the types itself.
import { FADE_LENGTH, PAUSE_FACTOR, playState, soundLevel } from '../src/video/screen-range.ts';

const sound = { volume: 1, refDistance: 1, fadeDistance: 12 };

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

describe('soundLevel', () => {
    it('is full up to the reference distance', () => {
        close(soundLevel(0.5, sound), 1);
        close(soundLevel(1, sound), 1);
    });

    it('falls off as one over distance', () => {
        close(soundLevel(2, sound), 0.5);
        close(soundLevel(4, sound), 0.25);
    });

    it('fades to silence over the last three metres', () => {
        assert.equal(FADE_LENGTH, 3);
        close(soundLevel(9, sound), 1 / 9);
        close(soundLevel(10.5, sound), 0.5 / 10.5);
        close(soundLevel(12, sound), 0);
        close(soundLevel(20, sound), 0);
    });

    it('scales with volume', () => {
        close(soundLevel(2, { ...sound, volume: 0.5 }), 0.25);
    });
});

describe('playState', () => {
    it('plays inside playDistance and keeps playing until ten percent beyond', () => {
        assert.equal(PAUSE_FACTOR, 1.1);
        assert.equal(playState(19, 20, false), true);
        assert.equal(playState(21, 20, true), true);
        assert.equal(playState(22.1, 20, true), false);
        assert.equal(playState(21, 20, false), false);
    });
});
