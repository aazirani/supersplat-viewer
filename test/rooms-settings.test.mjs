import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build: Node strips the types itself.
import { readRooms } from '../src/rooms/rooms-settings.ts';

const valid = () => [
    {
        id: 'hall',
        doors: [
            {
                to: 'tunnel',
                label: 'تونل',
                center: [5.0, 0.3, -5.8],
                size: [1.4, 2.6, 1.0],
                preloadRadius: 8,
                arrival: { position: [-5.3, 1.35, -0.75], target: [0, 1.2, -0.75] }
            }
        ]
    },
    {
        id: 'tunnel',
        contentUrl: './tunnel/lod-meta.json',
        settingsUrl: './tunnel-settings.json',
        doors: [
            {
                to: 'hall',
                label: 'تالار',
                center: [-6.8, 0.9, -0.75],
                size: [1.0, 2.4, 1.4],
                arrival: { position: [5.0, 0.6, -4.2], target: [5.0, 0.3, 2.0] }
            }
        ]
    }
];

describe('readRooms', () => {
    it('returns no rooms and no warnings when raw is undefined', () => {
        assert.deepEqual(readRooms(undefined), { rooms: [], warnings: [] });
    });

    it('warns when rooms is not an array', () => {
        const { rooms, warnings } = readRooms({});
        assert.deepEqual(rooms, []);
        assert.equal(warnings.length, 1);
    });

    it('parses the spec example', () => {
        const { rooms, warnings } = readRooms(valid());
        assert.deepEqual(rooms.map(r => r.id), ['hall', 'tunnel']);
        assert.equal(rooms[0].contentUrl, undefined);
        assert.equal(rooms[1].contentUrl, './tunnel/lod-meta.json');
        assert.equal(rooms[0].doors[0].preloadRadius, 8);
        assert.equal(rooms[1].doors[0].preloadRadius, 8);
        assert.deepEqual(warnings, []);
    });

    it('keeps an explicit preloadRadius', () => {
        const raw = valid();
        raw[0].doors[0].preloadRadius = 12;
        assert.equal(readRooms(raw).rooms[0].doors[0].preloadRadius, 12);
    });

    it('disables rooms when the first entry is invalid', () => {
        const raw = valid();
        delete raw[0].id;
        const { rooms, warnings } = readRooms(raw);
        assert.deepEqual(rooms, []);
        assert.equal(warnings.length, 1);
    });

    it('skips a non-first room without contentUrl', () => {
        const raw = valid();
        delete raw[1].contentUrl;
        const { rooms, warnings } = readRooms(raw);
        assert.equal(rooms.length, 1);
        assert.ok(warnings.some(w => w.includes('tunnel')));
    });

    it('skips a duplicate id', () => {
        const raw = valid();
        raw.push({ ...valid()[1] });
        const { rooms, warnings } = readRooms(raw);
        assert.equal(rooms.length, 2);
        assert.ok(warnings.length >= 1);
    });

    it('skips a door with a malformed vector', () => {
        const raw = valid();
        raw[0].doors[0].center = [1, 2];
        const { rooms, warnings } = readRooms(raw);
        assert.equal(rooms[0].doors.length, 0);
        assert.equal(warnings.length, 1);
    });

    it('skips a door whose target room does not exist', () => {
        const raw = valid();
        raw[0].doors[0].to = 'cellar';
        const { rooms, warnings } = readRooms(raw);
        assert.equal(rooms[0].doors.length, 0);
        assert.ok(warnings[0].includes('unknown room'));
    });

    it('skips a door to its own room', () => {
        const raw = valid();
        raw[0].doors[0].to = 'hall';
        const { rooms, warnings } = readRooms(raw);
        assert.equal(rooms[0].doors.length, 0);
        assert.equal(warnings.length, 1);
    });

    it('skips a door with a non-positive size component', () => {
        const raw = valid();
        raw[0].doors[0].size = [1, 0, 1];
        const { rooms, warnings } = readRooms(raw);
        assert.equal(rooms[0].doors.length, 0);
        assert.equal(warnings.length, 1);
    });
});
