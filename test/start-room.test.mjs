import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build: Node strips the types itself.
import { startRoomDoor } from '../src/start-room.ts';

const door = (to) => ({
    to,
    label: to,
    center: [0, 0, 0],
    size: [1, 2, 1],
    preloadRadius: 8,
    arrival: { position: [0, 1, 0], target: [0, 1, 1] }
});
const hall = { id: 'hall', doors: [door('tunnel'), door('cellar')] };
const ids = ['hall', 'tunnel', 'cellar', 'attic'];

describe('startRoomDoor', () => {
    it('is null when no room is asked for', () => {
        assert.equal(startRoomDoor(undefined, hall, ids), null);
        assert.equal(startRoomDoor('', hall, ids), null);
    });

    it('is null for the first room itself', () => {
        assert.equal(startRoomDoor('hall', hall, ids), null);
    });

    it('names the door of the first room that leads to the room', () => {
        assert.deepEqual(startRoomDoor('cellar', hall, ids), { door: 1 });
    });

    it('warns about an unknown room', () => {
        const result = startRoomDoor('garden', hall, ids);
        assert.match(result.warning, /garden/);
        assert.match(result.warning, /unknown/i);
    });

    it('warns when no door of the first room leads there', () => {
        const result = startRoomDoor('attic', hall, ids);
        assert.match(result.warning, /attic/);
        assert.match(result.warning, /door/);
    });
});
