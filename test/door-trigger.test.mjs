import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build; Node strips the types itself.
import { arrivalThrough, evaluateDoors, insideDoor } from '../src/rooms/door-trigger.ts';

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

    it("names the nearest door's room, even beyond every radius", () => {
        const far = { ...door('c'), center: [30, 0, 0] };
        const d = evaluateDoors([door('b'), far], at(100), 'orbit', false, [false, false]);
        assert.deepEqual(d.preload, []);
        assert.equal(d.nearest, 'c');
    });

    it('has no nearest room without doors', () => {
        assert.equal(evaluateDoors([], at(0), 'orbit', false, []).nearest, null);
    });
});

describe('arrivalThrough', () => {
    // The hall's tunnel door: through it along -z. The arrival in the tunnel looks along +x,
    // 5.3 m from its position.
    const hallDoor = {
        to: 'tunnel',
        label: 'tunnel',
        center: [5.0, 0.3, -5.8],
        size: [1.4, 2.6, 1.0],
        preloadRadius: 8,
        arrival: { position: [-5.3, 1.35, -0.75], target: [0, 1.35, -0.75] }
    };
    const inDoor = (yaw, pitch = 0) => ({ x: 5.0, y: 0.3, z: -5.7, yaw, pitch });
    const near = (actual, expected) => {
        for (let i = 0; i < 3; i++) assert.ok(Math.abs(actual[i] - expected[i]) < 1e-6, `${actual} vs ${expected}`);
    };

    it('walking straight through arrives looking the configured way', () => {
        const a = arrivalThrough(hallDoor, inDoor(0), hallDoor.arrival);
        near(a.position, [-5.3, 1.35, -0.75]);
        near(a.target, [0, 1.35, -0.75]);
    });

    it('walking through backwards arrives looking back at the door', () => {
        const a = arrivalThrough(hallDoor, inDoor(180), hallDoor.arrival);
        near(a.target, [-10.6, 1.35, -0.75]);
    });

    it('looking to one side on the way through keeps that side', () => {
        // yaw 90 faces -x, 90 degrees clockwise from -z seen from above
        const a = arrivalThrough(hallDoor, inDoor(90), hallDoor.arrival);
        near(a.target, [-5.3, 1.35, -0.75 - 5.3]);
    });

    it('keeps the pitch', () => {
        const a = arrivalThrough(hallDoor, inDoor(0, 30), hallDoor.arrival);
        near(a.target, [-5.3 + 5.3 * Math.cos(Math.PI / 6), 1.35 + 5.3 * Math.sin(Math.PI / 6), -0.75]);
    });

    it('takes the through direction from the side the visitor stands on', () => {
        // entering from the far side, facing +z, is walking straight through
        const a = arrivalThrough(hallDoor, { x: 5.0, y: 0.3, z: -5.9, yaw: 180, pitch: 0 }, hallDoor.arrival);
        near(a.target, [0, 1.35, -0.75]);
    });

    it('keeps the configured arrival without a heading, on the centre plane, or for a square door', () => {
        assert.deepEqual(arrivalThrough(hallDoor, { x: 5.0, y: 0.3, z: -5.7 }, hallDoor.arrival), hallDoor.arrival);
        assert.deepEqual(
            arrivalThrough(hallDoor, { x: 5.0, y: 0.3, z: -5.8, yaw: 180, pitch: 0 }, hallDoor.arrival),
            hallDoor.arrival
        );
        const square = { ...hallDoor, size: [1.0, 2.6, 1.0] };
        assert.deepEqual(arrivalThrough(square, inDoor(180), hallDoor.arrival), hallDoor.arrival);
    });
});
