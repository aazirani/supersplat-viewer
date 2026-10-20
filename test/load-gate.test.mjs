import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build: Node strips the types itself.
import { createLoadGate } from '../src/load-gate.ts';

describe('createLoadGate', () => {
    it('lets a wanted load through', () => {
        const gate = createLoadGate(() => false);
        assert.equal(gate.progress(), 'continue');
        assert.equal(gate.load(), 'resolve');
    });

    it('cancels on progress once the load is no longer wanted, and ignores the load that still lands', () => {
        let wanted = true;
        const gate = createLoadGate(() => !wanted);
        assert.equal(gate.progress(), 'continue');
        wanted = false;
        assert.equal(gate.progress(), 'cancel');
        // the engine keeps downloading and fires load anyway
        assert.equal(gate.load(), 'ignore');
        assert.equal(gate.progress(), 'ignore');
        assert.equal(gate.error(), 'ignore');
    });

    it('cancels a load that lands after the cancellation with no progress event in between', () => {
        let wanted = true;
        const gate = createLoadGate(() => !wanted);
        gate.progress();
        wanted = false;
        assert.equal(gate.load(), 'cancel');
        assert.equal(gate.load(), 'ignore');
    });

    it('rejects an error once, and ignores anything after it', () => {
        const gate = createLoadGate(() => false);
        assert.equal(gate.error(), 'reject');
        assert.equal(gate.load(), 'ignore');
        assert.equal(gate.error(), 'ignore');
    });
});
