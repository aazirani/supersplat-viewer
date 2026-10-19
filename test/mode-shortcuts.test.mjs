import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

// Imported from source rather than the build: the class is internal to the bundle. Node strips
// the types itself.
import { ModeShortcuts } from '../src/input/app/mode-shortcuts.ts';

// the shortcuts listen on window; node has none, so stand one in
const press = (code, key) => {
    const event = new Event('keydown');
    Object.assign(event, { code, key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false });
    globalThis.window.dispatchEvent(event);
};

const setup = (cameraMode = 'orbit') => {
    const fired = [];
    const state = { inputEnabled: true, inputMode: 'desktop', cameraMode, gamingControls: false };
    const events = { fire: (...args) => fired.push(args) };
    const shortcuts = new ModeShortcuts();
    shortcuts.attach({ state, events }, { recentlyExitedCapture: false });
    return { state, fired, shortcuts };
};

describe('ModeShortcuts', () => {
    let shortcuts;

    beforeEach(() => {
        globalThis.window = new EventTarget();
    });

    afterEach(() => {
        shortcuts?.detach();
        delete globalThis.window;
    });

    it('moves into first person on WASD without capturing the mouse', () => {
        const ctx = setup('orbit');
        shortcuts = ctx.shortcuts;
        press('KeyW', 'w');
        assert.deepEqual(ctx.fired, [['inputEvent', 'requestFirstPerson']]);
        // gaming controls lock the pointer and hide the annotations; moving should not
        assert.equal(ctx.state.gamingControls, false);
    });

    it('keeps the mouse free on WASD while already flying', () => {
        const ctx = setup('fly');
        shortcuts = ctx.shortcuts;
        press('KeyD', 'd');
        assert.deepEqual(ctx.fired, []);
        assert.equal(ctx.state.gamingControls, false);
    });

    it('still turns gaming controls on with G', () => {
        const ctx = setup('fly');
        shortcuts = ctx.shortcuts;
        press('KeyG', 'g');
        assert.equal(ctx.state.gamingControls, true);
    });
});
