import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build: Node strips the types itself.
import { QUIET_CAP_MS, QUIET_DELAY_MS, createSettleWatch } from '../src/rooms/settle-watch.ts';

describe('createSettleWatch', () => {
    it('is not settled on the reveal frame, which reports nothing in flight before streaming starts', () => {
        const watch = createSettleWatch(0);
        watch.frame(true, 0, 0);
        assert.equal(watch.settled(0), false);
    });

    it('settles after a frame that streamed and then one that did not', () => {
        const watch = createSettleWatch(0);
        watch.frame(true, 12, 100);
        assert.equal(watch.settled(100), false);
        watch.frame(true, 0, 200);
        assert.equal(watch.settled(200), true);
    });

    it('settles after a quiet frame once a second has passed without streaming', () => {
        assert.equal(QUIET_DELAY_MS, 1000);
        const watch = createSettleWatch(0);
        watch.frame(true, 0, 500);
        assert.equal(watch.settled(500), false);
        watch.frame(true, 0, 1000);
        assert.equal(watch.settled(1000), true);
    });

    it('a frame that is not ready is not quiet', () => {
        const watch = createSettleWatch(0);
        watch.frame(false, 0, 5000);
        assert.equal(watch.settled(5000), false);
    });

    it('settles after fifteen seconds whatever the frames say', () => {
        assert.equal(QUIET_CAP_MS, 15000);
        const watch = createSettleWatch(0);
        watch.frame(true, 50, 14999);
        assert.equal(watch.settled(14999), false);
        assert.equal(watch.settled(15000), true);
    });

    it('reset starts over, for the next room', () => {
        const watch = createSettleWatch(0);
        watch.frame(true, 12, 100);
        watch.frame(true, 0, 200);
        assert.equal(watch.settled(200), true);
        watch.reset(200);
        assert.equal(watch.settled(200), false);
        // the reveal frame again: quiet does not count until something has streamed or a
        // second has passed
        watch.frame(true, 0, 300);
        assert.equal(watch.settled(300), false);
        assert.equal(watch.settled(15200), true);
    });
});
