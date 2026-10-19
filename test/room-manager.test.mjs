import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

// Imported from source rather than the build; Node strips the types itself.
import { FADE_WAIT_SPINNER_MS, RoomManager } from '../src/rooms/room-manager.ts';

const arrival = (position, target) => ({ position, target });
const door = (to, center, size, arrive, preloadRadius = 8) => ({
    to,
    label: to,
    center,
    size,
    preloadRadius,
    arrival: arrive
});

// The spec example: hall <-> tunnel.
const specRooms = () => [
    {
        id: 'hall',
        doors: [door('tunnel', [5.0, 0.3, -5.8], [1.4, 2.6, 1.0], arrival([-5.3, 1.35, -0.75], [0, 1.2, -0.75]))]
    },
    {
        id: 'tunnel',
        contentUrl: './tunnel/lod-meta.json',
        settingsUrl: './tunnel-settings.json',
        doors: [door('hall', [-6.8, 0.9, -0.75], [1.0, 2.4, 1.4], arrival([5.0, 0.6, -4.2], [5.0, 0.3, 2.0]))]
    }
];

// Hall with doors to the tunnel (+x) and the cellar (-x), far apart.
const threeRooms = () => [
    {
        id: 'hall',
        doors: [
            door('tunnel', [20, 0, 0], [1, 2, 1], arrival([0, 0, 0], [0, 0, -1]), 5),
            door('cellar', [-20, 0, 0], [1, 2, 1], arrival([0, 0, 0], [0, 0, -1]), 5)
        ]
    },
    { id: 'tunnel', contentUrl: './t.json', doors: [] },
    { id: 'cellar', contentUrl: './c.json', doors: [] }
];

const at = (x, y, z) => ({ x, y, z });
const nearHallDoor = at(5.0, 0.3, -3.0); // within 8 m, outside the box
const inHallDoor = at(5.0, 0.3, -5.8);
const farAway = at(-50, 0, 0);
const inTunnelDoor = at(-6.8, 0.9, -0.75);

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const name = (instance) => instance.replace(/-instance$/, '');

// Records every call; `load` and `whenReady` are settled by hand through `loads` / `readies`.
const fakeHost = () => {
    const calls = [];
    const loads = [];
    const readies = [];
    const host = {
        calls,
        loads,
        readies,
        load(room) {
            calls.push(`load:${room.id}`);
            const d = deferred();
            loads.push({ id: room.id, ...d });
            return d.promise;
        },
        whenReady(instance) {
            calls.push(`ready:${name(instance)}`);
            const d = deferred();
            readies.push({ id: name(instance), ...d });
            return d.promise;
        },
        activate(instance, room, arrive) {
            calls.push(`activate:${name(instance)}`);
            host.lastArrival = arrive;
            host.lastActivatedRoom = room;
        },
        release(instance) {
            calls.push(`release:${name(instance)}`);
        },
        fade(opaque) {
            calls.push(`fade:${opaque}`);
            return Promise.resolve();
        },
        setWaiting(on) {
            calls.push(`waiting:${on}`);
        },
        warn(message) {
            calls.push(`warn:${message}`);
        }
    };
    return host;
};

// Lets pending promise continuations run (setImmediate is not mocked).
const flush = () => new Promise((resolve) => setImmediate(resolve));

const lastLoad = (host, id) => host.loads.filter((l) => l.id === id).at(-1);
const lastReady = (host, id) => host.readies.filter((r) => r.id === id).at(-1);
const count = (host, call) => host.calls.filter((c) => c === call).length;

describe('RoomManager', () => {
    let host;
    let manager;

    beforeEach(() => {
        mock.timers.enable({ apis: ['setTimeout'] });
        host = fakeHost();
        manager = new RoomManager(specRooms(), 'hall-instance', host);
    });

    afterEach(() => {
        mock.timers.reset();
    });

    it('exposes the spinner delay', () => {
        assert.equal(FADE_WAIT_SPINNER_MS, 300);
    });

    it('starts in the first room, not busy', () => {
        assert.equal(manager.current.id, 'hall');
        assert.equal(manager.busy, false);
    });

    it('does not preload before start()', () => {
        manager.update(nearHallDoor, 'walk', false);
        manager.update(inHallDoor, 'walk', false);
        assert.deepEqual(host.calls, []);
    });

    it('preloads the destination once when within the radius after start()', async () => {
        manager.start();
        manager.update(nearHallDoor, 'orbit', false);
        manager.update(nearHallDoor, 'orbit', false);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        manager.update(nearHallDoor, 'orbit', false);
        assert.deepEqual(host.calls, ['load:tunnel']);
    });

    it('walking into the door runs fade → ready → activate → release old → fade in, in that order', async () => {
        const changes = [];
        manager.onChange = (room) => changes.push(room.id);
        manager.start();
        manager.update(nearHallDoor, 'walk', false);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();

        manager.update(inHallDoor, 'walk', false);
        assert.equal(manager.busy, true);
        await flush();
        lastReady(host, 'tunnel').resolve();
        await flush();

        assert.deepEqual(host.calls, [
            'load:tunnel',
            'fade:true',
            'ready:tunnel',
            'activate:tunnel',
            'release:hall',
            'fade:false'
        ]);
        assert.equal(manager.current.id, 'tunnel');
        assert.equal(manager.busy, false);
        assert.deepEqual(changes, ['tunnel']);
        assert.deepEqual(host.lastArrival, specRooms()[0].doors[0].arrival);
        assert.equal(host.lastActivatedRoom.id, 'tunnel');
    });

    it('enter() loads the destination if it was not preloaded', async () => {
        manager.start();
        const done = manager.enter(0);
        assert.deepEqual(host.calls, ['fade:true', 'load:tunnel']);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        lastReady(host, 'tunnel').resolve();
        await done;
        assert.equal(manager.current.id, 'tunnel');
        assert.equal(count(host, 'activate:tunnel'), 1);
    });

    it('shows the spinner only after 300 ms of waiting and hides it before fading in', async () => {
        manager.start();
        const done = manager.enter(0);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();

        mock.timers.tick(FADE_WAIT_SPINNER_MS - 1);
        assert.equal(count(host, 'waiting:true'), 0);
        mock.timers.tick(1);
        assert.equal(count(host, 'waiting:true'), 1);

        lastReady(host, 'tunnel').resolve();
        await done;
        const hide = host.calls.indexOf('waiting:false');
        assert.ok(hide > host.calls.indexOf('waiting:true'));
        assert.ok(hide < host.calls.indexOf('fade:false'));
    });

    it('does not show the spinner if the room is ready within 300 ms', async () => {
        manager.start();
        const done = manager.enter(0);
        mock.timers.tick(100);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        mock.timers.tick(100);
        lastReady(host, 'tunnel').resolve();
        await done;
        mock.timers.tick(1000);
        assert.equal(count(host, 'waiting:true'), 0);
    });

    it('ignores a second enter() while busy', async () => {
        manager.start();
        const first = manager.enter(0);
        const second = manager.enter(0);
        assert.equal(count(host, 'fade:true'), 1);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        manager.enter(0);
        manager.update(inHallDoor, 'walk', false);
        lastReady(host, 'tunnel').resolve();
        await Promise.all([first, second]);
        assert.equal(count(host, 'activate:tunnel'), 1);
        assert.equal(count(host, 'load:tunnel'), 1);
        assert.equal(count(host, 'fade:true'), 1);
    });

    it('failure: load rejects → fades back in, warns, stays in the hall, door works again', async () => {
        manager.start();
        const done = manager.enter(0);
        lastLoad(host, 'tunnel').reject(new Error('404'));
        await done;

        assert.equal(manager.current.id, 'hall');
        assert.equal(manager.busy, false);
        assert.equal(count(host, 'activate:tunnel'), 0);
        assert.equal(count(host, 'release:hall'), 0);
        const warn = host.calls.findIndex((c) => c.startsWith('warn:'));
        assert.ok(warn >= 0);
        assert.match(host.calls[warn], /tunnel/);
        assert.ok(host.calls.indexOf('fade:false') > host.calls.indexOf('fade:true'));

        const again = manager.enter(0);
        assert.equal(count(host, 'load:tunnel'), 2);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        lastReady(host, 'tunnel').resolve();
        await again;
        assert.equal(manager.current.id, 'tunnel');
    });

    it('failure: whenReady rejects → releases the loaded room and stays in the hall', async () => {
        manager.start();
        const done = manager.enter(0);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        lastReady(host, 'tunnel').reject(new Error('tiles failed'));
        await done;

        assert.equal(manager.current.id, 'hall');
        assert.equal(manager.busy, false);
        assert.equal(count(host, 'activate:tunnel'), 0);
        assert.equal(count(host, 'release:tunnel'), 1);
        assert.ok(host.calls.indexOf('release:tunnel') < host.calls.indexOf('fade:false'));
        assert.ok(host.calls.some((c) => c.startsWith('warn:')));
    });

    it('a failed walk-in does not retry until the camera leaves and re-enters the door', async () => {
        manager.start();
        manager.update(farAway, 'walk', false); // arms the door
        manager.update(inHallDoor, 'walk', false);
        assert.equal(manager.busy, true);
        lastLoad(host, 'tunnel').reject(new Error('404'));
        await flush();
        await flush();
        assert.equal(manager.busy, false);

        manager.update(inHallDoor, 'walk', false);
        assert.equal(manager.busy, false);
        assert.equal(count(host, 'fade:true'), 1);

        manager.update(farAway, 'walk', false);
        manager.update(inHallDoor, 'walk', false);
        assert.equal(manager.busy, true);
        assert.equal(count(host, 'load:tunnel'), 2);
    });

    it('a failed preload is retried after leaving and re-entering the radius', async () => {
        manager.start();
        manager.update(nearHallDoor, 'orbit', false);
        lastLoad(host, 'tunnel').reject(new Error('404'));
        await flush();
        manager.update(nearHallDoor, 'orbit', false);
        assert.equal(count(host, 'load:tunnel'), 1);

        manager.update(farAway, 'orbit', false);
        manager.update(nearHallDoor, 'orbit', false);
        assert.equal(count(host, 'load:tunnel'), 2);
    });

    it('at most one parked room: preloading another room releases the previous preload', async () => {
        host = fakeHost();
        manager = new RoomManager(threeRooms(), 'hall-instance', host);
        manager.start();
        manager.update(at(18, 0, 0), 'orbit', false);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();

        manager.update(at(0, 0, 0), 'orbit', false); // out of both radii: the preload stays
        assert.equal(count(host, 'release:tunnel'), 0);

        manager.update(at(-18, 0, 0), 'orbit', false);
        assert.deepEqual(host.calls, ['load:tunnel', 'release:tunnel', 'load:cellar']);
    });

    it('releases a preload that resolves after it was replaced', async () => {
        host = fakeHost();
        manager = new RoomManager(threeRooms(), 'hall-instance', host);
        manager.start();
        manager.update(at(18, 0, 0), 'orbit', false);
        manager.update(at(-18, 0, 0), 'orbit', false);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        assert.deepEqual(host.calls, ['load:tunnel', 'load:cellar', 'release:tunnel']);
    });

    it("after arriving, the destination's doors start disarmed", async () => {
        manager.start();
        const done = manager.enter(0);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        lastReady(host, 'tunnel').resolve();
        await done;
        const fades = count(host, 'fade:true');

        manager.update(inTunnelDoor, 'walk', false);
        manager.update(inTunnelDoor, 'walk', false);
        assert.equal(manager.busy, false);
        assert.equal(count(host, 'fade:true'), fades);
    });

    it('destroy() releases a parked room', async () => {
        manager.start();
        manager.update(nearHallDoor, 'orbit', false);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        manager.destroy();
        assert.equal(count(host, 'release:tunnel'), 1);
        manager.update(nearHallDoor, 'orbit', false);
        assert.equal(count(host, 'load:tunnel'), 1);
    });

    it('destroy() releases a parked room whose load is still pending once it resolves', async () => {
        manager.start();
        manager.update(nearHallDoor, 'orbit', false);
        manager.destroy();
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        assert.equal(count(host, 'release:tunnel'), 1);
    });

    it('destroy() during a transition stops it', async () => {
        const changes = [];
        manager.onChange = (room) => changes.push(room.id);
        manager.start();
        const done = manager.enter(0);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        manager.destroy();
        lastReady(host, 'tunnel').resolve();
        await done;
        mock.timers.tick(1000);

        assert.equal(count(host, 'activate:tunnel'), 0);
        assert.equal(count(host, 'release:tunnel'), 1);
        assert.equal(count(host, 'release:hall'), 0);
        assert.equal(count(host, 'waiting:true'), 0);
        assert.deepEqual(changes, []);
    });

    it('a whenReady failure is not retried in the background until the camera re-approaches', async () => {
        manager.start();
        manager.update(farAway, 'walk', false); // arms the door
        manager.update(nearHallDoor, 'walk', false);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        manager.update(inHallDoor, 'walk', false);
        await flush();
        lastReady(host, 'tunnel').reject(new Error('tiles failed'));
        await flush();
        await flush();
        assert.equal(manager.busy, false);

        manager.update(nearHallDoor, 'walk', false);
        assert.equal(count(host, 'load:tunnel'), 1);

        manager.update(farAway, 'walk', false);
        manager.update(nearHallDoor, 'walk', false);
        assert.equal(count(host, 'load:tunnel'), 2);
    });
});

describe('RoomManager when the host throws', () => {
    let host;
    let manager;
    let unhandled;
    const onUnhandled = (reason) => unhandled.push(reason);

    beforeEach(() => {
        mock.timers.enable({ apis: ['setTimeout'] });
        unhandled = [];
        process.on('unhandledRejection', onUnhandled);
        host = fakeHost();
        manager = new RoomManager(specRooms(), 'hall-instance', host);
        manager.start();
    });

    afterEach(() => {
        process.off('unhandledRejection', onUnhandled);
        mock.timers.reset();
    });

    // Walks into the hall door with the tunnel preloaded, and lets it become ready.
    const walkIn = async () => {
        manager.update(farAway, 'walk', false);
        manager.update(nearHallDoor, 'walk', false);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        manager.update(inHallDoor, 'walk', false);
        await flush();
        lastReady(host, 'tunnel').resolve();
        await flush();
        await flush();
    };

    const warnings = () => host.calls.filter((c) => c.startsWith('warn:'));

    it('activate throwing: fades back in, warns, stays in the hall, not busy, no unhandled rejection', async () => {
        host.activate = (instance) => {
            host.calls.push(`activate:${name(instance)}`);
            throw new Error('activate broke');
        };
        await walkIn();

        assert.equal(manager.busy, false);
        assert.equal(manager.current.id, 'hall');
        assert.ok(host.calls.indexOf('fade:false') > host.calls.indexOf('activate:tunnel'));
        assert.equal(warnings().length, 1);
        assert.match(warnings()[0], /activate broke/);
        assert.equal(count(host, 'release:hall'), 0);
        assert.deepEqual(unhandled, []);

        // the door was disarmed (no loop) and the parked tunnel is kept for a retry
        manager.update(inHallDoor, 'walk', false);
        assert.equal(manager.busy, false);
        assert.equal(count(host, 'release:tunnel'), 0);
        manager.destroy();
        assert.equal(count(host, 'release:tunnel'), 1);
    });

    it('release of the old room throwing: still arrives in the tunnel and fades in', async () => {
        const changes = [];
        manager.onChange = (room) => changes.push(room.id);
        host.release = (instance) => {
            host.calls.push(`release:${name(instance)}`);
            throw new Error('release broke');
        };
        await walkIn();

        assert.equal(manager.busy, false);
        assert.equal(manager.current.id, 'tunnel');
        assert.deepEqual(changes, ['tunnel']);
        assert.ok(host.calls.indexOf('fade:false') > host.calls.indexOf('release:hall'));
        assert.equal(warnings().length, 1);
        assert.deepEqual(unhandled, []);
    });

    it('onChange throwing: not busy, faded in, warned', async () => {
        manager.onChange = () => {
            throw new Error('listener broke');
        };
        await walkIn();

        assert.equal(manager.busy, false);
        assert.equal(manager.current.id, 'tunnel');
        assert.equal(count(host, 'fade:false'), 1);
        assert.equal(warnings().length, 1);
        assert.deepEqual(unhandled, []);
    });

    it('the final fade in rejecting: not busy, warned, no unhandled rejection', async () => {
        host.fade = (opaque) => {
            host.calls.push(`fade:${opaque}`);
            return opaque ? Promise.resolve() : Promise.reject(new Error('fade broke'));
        };
        await walkIn();

        assert.equal(manager.busy, false);
        assert.equal(manager.current.id, 'tunnel');
        assert.equal(warnings().length, 1);
        assert.deepEqual(unhandled, []);
    });

    it('the fade in after a failed load rejecting: not busy, no unhandled rejection', async () => {
        host.fade = (opaque) => {
            host.calls.push(`fade:${opaque}`);
            return opaque ? Promise.resolve() : Promise.reject(new Error('fade broke'));
        };
        manager.update(farAway, 'walk', false);
        manager.update(inHallDoor, 'walk', false);
        lastLoad(host, 'tunnel').reject(new Error('404'));
        await flush();
        await flush();

        assert.equal(manager.busy, false);
        assert.equal(manager.current.id, 'hall');
        assert.ok(warnings().some((w) => /404/.test(w)));
        assert.deepEqual(unhandled, []);
    });

    it('fade out throwing: not busy, warned, no unhandled rejection', async () => {
        host.fade = (opaque) => {
            host.calls.push(`fade:${opaque}`);
            if (opaque) throw new Error('fade broke');
            return Promise.resolve();
        };
        manager.update(farAway, 'walk', false);
        manager.update(inHallDoor, 'walk', false);
        await flush();
        await flush();

        assert.equal(manager.busy, false);
        assert.equal(manager.current.id, 'hall');
        assert.equal(count(host, 'fade:false'), 1);
        assert.equal(warnings().length, 1);
        assert.deepEqual(unhandled, []);
    });
});
