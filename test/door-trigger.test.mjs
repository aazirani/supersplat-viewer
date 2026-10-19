import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build; Node strips the types itself.
import { evaluateDoors, insideDoor } from '../src/rooms/door-trigger.ts';

const door = (to = 'b') => ({
    to,
    label: 'Room B',
    center: [0, 0, 0],
    size: [2, 2, 2],
    preloadRadius: 8,
    arrival: { position: [0, 0, 0], target: [0, 0, -1] }
});
const at = (x, y = 0, z = 0) => ({ x, y, z });
const modes = ['orbit', 'anim', 'fly', 'walk'];

describe('insideDoor', () => {
    it('is true at the centre and on the face, false just outside', () => {
        assert.equal(insideDoor(door(), at(0)), true);
        assert.equal(insideDoor(door(), at(1)), true);
        assert.equal(insideDoor(door(), at(1.01)), false);
    });
});

describe('evaluateDoors', () => {
    it('preloads the destination within the radius, in every mode', () => {
        for (const m of modes) {
            assert.deepEqual(evaluateDoors([door()], at(7.9), m, false, [false]).preload, ['b']);
        }
    });

    it('does not preload beyond the radius', () => {
        for (const m of modes) {
            assert.deepEqual(evaluateDoors([door()], at(8.1), m, false, [false]).preload, []);
        }
    });

    it('re-arms a disarmed door once the camera is outside it', () => {
        const d = evaluateDoors([door()], at(5), 'fly', false, [false]);
        assert.deepEqual(d.armed, [true]);
        assert.equal(d.enter, null);
    });

    it('enters an armed door in fly and walk', () => {
        for (const m of ['fly', 'walk']) {
            assert.equal(evaluateDoors([door()], at(0), m, false, [true]).enter, 0);
        }
    });

    it('never enters in orbit or anim, or during XR', () => {
        assert.equal(evaluateDoors([door()], at(0), 'orbit', false, [true]).enter, null);
        assert.equal(evaluateDoors([door()], at(0), 'anim', false, [true]).enter, null);
        assert.equal(evaluateDoors([door()], at(0), 'fly', true, [true]).enter, null);
    });

    it('does not enter a disarmed door while the camera stays inside it', () => {
        const d = evaluateDoors([door()], at(0), 'fly', false, [false]);
        assert.equal(d.enter, null);
        assert.deepEqual(d.armed, [false]);
    });

    it('lists each destination once', () => {
        const d = evaluateDoors([door(), door()], at(0), 'orbit', false, [false, false]);
        assert.deepEqual(d.preload, ['b']);
    });
});
