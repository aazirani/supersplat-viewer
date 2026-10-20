import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build; Node strips the types itself.
import { READY_STALL_TIMEOUT_MS, createReadyWatch } from '../src/rooms/ready-watch.ts';

describe('createReadyWatch', () => {
    it('is ready once every file is resident', () => {
        const watch = createReadyWatch(3, 0, 1000);
        assert.equal(watch(0, 0), 'waiting');
        assert.equal(watch(2, 100), 'waiting');
        assert.equal(watch(3, 200), 'ready');
    });

    it('stalls when no file arrives within the timeout', () => {
        const watch = createReadyWatch(3, 0, 1000);
        assert.equal(watch(1, 0), 'waiting');
        assert.equal(watch(1, 999), 'waiting');
        assert.equal(watch(1, 1000), 'stalled');
    });

    it('restarts the deadline whenever another file arrives', () => {
        const watch = createReadyWatch(3, 0, 1000);
        assert.equal(watch(0, 0), 'waiting');
        assert.equal(watch(1, 900), 'waiting');
        assert.equal(watch(1, 1800), 'waiting');
        assert.equal(watch(2, 1899), 'waiting');
        assert.equal(watch(2, 2898), 'waiting');
        assert.equal(watch(2, 2899), 'stalled');
    });

    it('counts from the start when nothing has arrived yet', () => {
        const watch = createReadyWatch(2, 500, 1000);
        assert.equal(watch(0, 1499), 'waiting');
        assert.equal(watch(0, 1500), 'stalled');
    });

    it('does not count time while paused', () => {
        const watch = createReadyWatch(2, 0, 1000);
        assert.equal(watch(0, 0), 'waiting');
        assert.equal(watch(0, 5000, true), 'waiting');
        assert.equal(watch(0, 5999), 'waiting');
        assert.equal(watch(0, 6000), 'stalled');
    });

    it('does not restart the deadline when a file is evicted and comes back', () => {
        const watch = createReadyWatch(3, 0, 1000);
        assert.equal(watch(2, 0), 'waiting');
        assert.equal(watch(1, 500), 'waiting');
        assert.equal(watch(2, 900), 'waiting');
        assert.equal(watch(2, 1000), 'stalled');
    });

    it('restarts the deadline on part of a file arriving, and is ready only once every file has', () => {
        // progress is in files: a file half downloaded counts 0.5
        const watch = createReadyWatch(2, 0, 1000);
        assert.equal(watch(0, 0), 'waiting');
        assert.equal(watch(0.5, 900), 'waiting');
        assert.equal(watch(0.5, 1800), 'waiting');
        assert.equal(watch(1.99, 1899), 'waiting');
        assert.equal(watch(1.99, 2899), 'stalled');
        assert.equal(watch(2, 2900), 'ready');
    });

    it('defaults to a 30 second stall timeout', () => {
        assert.equal(READY_STALL_TIMEOUT_MS, 30000);
        const watch = createReadyWatch(1, 0);
        assert.equal(watch(0, 29999), 'waiting');
        assert.equal(watch(0, 30000), 'stalled');
    });
});
