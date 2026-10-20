import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

// Imported from source rather than the build; Node strips the types itself.
import { RoomManager } from '../src/rooms/room-manager.ts';

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
        // what progress() reports for a loaded, not yet ready room
        progressValue: 0,
        load(room, signal) {
            calls.push(`load:${room.id}`);
            const d = deferred();
            loads.push({ id: room.id, signal, ...d });
            return d.promise;
        },
        whenReady(instance) {
            calls.push(`ready:${name(instance)}`);
            const d = deferred();
            readies.push({ id: name(instance), ...d });
            return d.promise;
        },
        progress() {
            return host.progressValue;
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
const warnings = (host) => host.calls.filter((c) => c.startsWith('warn:'));

// A frame on which the current room has nothing left to stream.
const QUIET = true;

// Preloads and readies the hall's tunnel from `p`, with the hall quiet.
const preloadTunnel = async (manager, host, p = nearHallDoor, mode = 'walk') => {
    manager.update(p, mode, false, QUIET);
    lastLoad(host, 'tunnel').resolve('tunnel-instance');
    await flush();
    lastReady(host, 'tunnel').resolve();
    await flush();
};

describe('RoomManager', () => {
    let host;
    let manager;

    beforeEach(() => {
        host = fakeHost();
        manager = new RoomManager(specRooms(), 'hall-instance', host);
    });

    it('starts in the first room, not busy, with an idle door', () => {
        assert.equal(manager.current.id, 'hall');
        assert.equal(manager.busy, false);
        assert.deepEqual(manager.doorState(0), { load: 'idle', progress: 0, pending: null });
    });

    it('does not preload before start()', () => {
        manager.update(nearHallDoor, 'walk', false, QUIET);
        manager.update(inHallDoor, 'walk', false, QUIET);
        assert.deepEqual(host.calls, []);
    });

    describe('background preloading', () => {
        beforeEach(() => manager.start());

        it('waits for a quiet frame: the current room sharpens before the next one loads', () => {
            manager.update(nearHallDoor, 'orbit', false);
            manager.update(nearHallDoor, 'orbit', false);
            assert.deepEqual(host.calls, []);
            manager.update(nearHallDoor, 'orbit', false, QUIET);
            assert.deepEqual(host.calls, ['load:tunnel']);
        });

        it('once quiet, keeps preloading on busy frames and loads each room once', async () => {
            manager.update(farAway, 'orbit', false, QUIET);
            manager.update(nearHallDoor, 'orbit', false);
            lastLoad(host, 'tunnel').resolve('tunnel-instance');
            await flush();
            manager.update(nearHallDoor, 'orbit', false);
            assert.deepEqual(host.calls, ['load:tunnel', 'ready:tunnel']);
        });

        it('preloads the room behind the nearest door even beyond its radius', () => {
            manager.update(farAway, 'orbit', false, QUIET);
            assert.deepEqual(host.calls, ['load:tunnel']);
        });

        it('watches readiness as soon as the room has loaded, and reports its state', async () => {
            manager.update(nearHallDoor, 'orbit', false, QUIET);
            assert.deepEqual(manager.doorState(0), { load: 'loading', progress: 0, pending: null });

            lastLoad(host, 'tunnel').resolve('tunnel-instance');
            await flush();
            host.progressValue = 0.4;
            assert.deepEqual(host.calls, ['load:tunnel', 'ready:tunnel']);
            assert.deepEqual(manager.doorState(0), { load: 'loading', progress: 0.4, pending: null });

            lastReady(host, 'tunnel').resolve();
            await flush();
            assert.deepEqual(manager.doorState(0), { load: 'ready', progress: 1, pending: null });
        });

        it('keeps the parked room while no door is within its radius', async () => {
            host = fakeHost();
            manager = new RoomManager(threeRooms(), 'hall-instance', host);
            manager.start();
            manager.update(at(18, 0, 0), 'orbit', false, QUIET);
            lastLoad(host, 'tunnel').resolve('tunnel-instance');
            await flush();

            manager.update(at(-10, 0, 0), 'orbit', false); // nearer the cellar, outside both radii
            assert.equal(count(host, 'release:tunnel'), 0);
            assert.equal(count(host, 'load:cellar'), 0);
        });

        it("replaces the parked room when another door's radius is entered", async () => {
            host = fakeHost();
            manager = new RoomManager(threeRooms(), 'hall-instance', host);
            manager.start();
            manager.update(at(18, 0, 0), 'orbit', false, QUIET);
            lastLoad(host, 'tunnel').resolve('tunnel-instance');
            await flush();

            manager.update(at(-18, 0, 0), 'orbit', false);
            assert.deepEqual(host.calls, ['load:tunnel', 'ready:tunnel', 'release:tunnel', 'load:cellar']);
        });

        it('releases a preload that resolves after it was replaced', async () => {
            host = fakeHost();
            manager = new RoomManager(threeRooms(), 'hall-instance', host);
            manager.start();
            manager.update(at(18, 0, 0), 'orbit', false, QUIET);
            manager.update(at(-18, 0, 0), 'orbit', false);
            lastLoad(host, 'tunnel').resolve('tunnel-instance');
            await flush();
            assert.deepEqual(host.calls, ['load:tunnel', 'load:cellar', 'release:tunnel']);
        });

        it('a failed load: warns, shows the door as failed, and is not retried from afar', async () => {
            manager.update(farAway, 'orbit', false, QUIET);
            lastLoad(host, 'tunnel').reject(new Error('404'));
            await flush();
            assert.equal(warnings(host).length, 1);
            assert.match(warnings(host)[0], /404/);
            assert.deepEqual(manager.doorState(0), { load: 'failed', progress: 0, pending: null });

            manager.update(farAway, 'orbit', false, QUIET);
            manager.update(at(-20, 0, 0), 'orbit', false);
            assert.equal(count(host, 'load:tunnel'), 1);
        });

        it('a failed load is retried when the door is approached again', async () => {
            manager.update(nearHallDoor, 'orbit', false, QUIET);
            lastLoad(host, 'tunnel').reject(new Error('404'));
            await flush();
            manager.update(nearHallDoor, 'orbit', false);
            assert.equal(count(host, 'load:tunnel'), 1);

            manager.update(farAway, 'orbit', false);
            manager.update(nearHallDoor, 'orbit', false);
            assert.equal(count(host, 'load:tunnel'), 2);
            assert.equal(manager.doorState(0).load, 'loading');
        });

        it('a room that stops loading is released, warned about, and shown as failed', async () => {
            manager.update(nearHallDoor, 'orbit', false, QUIET);
            lastLoad(host, 'tunnel').resolve('tunnel-instance');
            await flush();
            lastReady(host, 'tunnel').reject(new Error('stalled'));
            await flush();
            assert.deepEqual(host.calls, [
                'load:tunnel',
                'ready:tunnel',
                'release:tunnel',
                'warn:rooms: could not preload room "tunnel": stalled'
            ]);
            assert.equal(manager.doorState(0).load, 'failed');
        });

        it('the parked room survives going into a door that is not ready', async () => {
            // with a failed state, a cancel must not drop the slot either
            manager.update(nearHallDoor, 'walk', false, QUIET);
            manager.update(inHallDoor, 'walk', false);
            manager.update(nearHallDoor, 'walk', false);
            assert.equal(count(host, 'load:tunnel'), 1);
            assert.equal(manager.doorState(0).load, 'loading');
        });
    });

    describe('going through a ready door', () => {
        beforeEach(() => manager.start());

        it('walking in runs fade out → activate → release old → fade in', async () => {
            const changes = [];
            manager.onChange = (room) => changes.push(room.id);
            await preloadTunnel(manager, host);

            manager.update(inHallDoor, 'walk', false);
            assert.equal(manager.busy, true);
            await flush();
            await flush();

            assert.deepEqual(host.calls, [
                'load:tunnel',
                'ready:tunnel',
                'fade:true',
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

        it('walking in backwards arrives looking back at the door', async () => {
            await preloadTunnel(manager, host);
            manager.update({ ...inHallDoor, z: -5.7, yaw: 180, pitch: 0 }, 'walk', false);
            await flush();
            await flush();
            assert.equal(manager.current.id, 'tunnel');
            assert.deepEqual(host.lastArrival.position, [-5.3, 1.35, -0.75]);
            const [x, y, z] = host.lastArrival.target;
            assert.ok(x < -10 && Math.abs(y - 1.35) < 0.2 && Math.abs(z + 0.75) < 1e-6, `${host.lastArrival.target}`);
        });

        it('tapping the marker goes through from anywhere', async () => {
            await preloadTunnel(manager, host, farAway, 'orbit');
            await manager.enter(0);
            assert.equal(manager.current.id, 'tunnel');
            assert.equal(count(host, 'activate:tunnel'), 1);
        });

        it('ignores a second enter() while busy', async () => {
            await preloadTunnel(manager, host);
            const first = manager.enter(0);
            const second = manager.enter(0);
            await Promise.all([first, second]);
            assert.equal(count(host, 'fade:true'), 1);
            assert.equal(count(host, 'activate:tunnel'), 1);
        });

        it("after arriving, the destination's doors start disarmed and its door is idle", async () => {
            await preloadTunnel(manager, host);
            await manager.enter(0);
            assert.equal(manager.current.id, 'tunnel');

            manager.update(inTunnelDoor, 'walk', false);
            assert.equal(manager.busy, false);
            assert.deepEqual(manager.doorState(0), { load: 'idle', progress: 0, pending: null });
        });

        it('after arriving, preloading the way back waits for the new room to go quiet', async () => {
            await preloadTunnel(manager, host);
            await manager.enter(0);

            manager.update(at(-5.3, 1.35, -0.75), 'walk', false); // the arrival pose, 1.5 m from the door back
            assert.equal(count(host, 'load:hall'), 0);
            manager.update(at(-5.3, 1.35, -0.75), 'walk', false, QUIET);
            assert.equal(count(host, 'load:hall'), 1);
        });
    });

    describe('going through a door that is still loading', () => {
        beforeEach(() => manager.start());

        it('walking in does not fade: it waits in the doorway and goes once the room is ready', async () => {
            manager.update(nearHallDoor, 'walk', false, QUIET);
            manager.update(inHallDoor, 'walk', false);
            assert.equal(count(host, 'fade:true'), 0);
            assert.equal(manager.busy, false);
            assert.deepEqual(manager.doorState(0), { load: 'loading', progress: 0, pending: 'walk' });

            lastLoad(host, 'tunnel').resolve('tunnel-instance');
            await flush();
            lastReady(host, 'tunnel').resolve();
            await flush();
            manager.update(inHallDoor, 'walk', false);
            assert.equal(manager.busy, true);
            await flush();
            await flush();
            assert.equal(manager.current.id, 'tunnel');
            assert.equal(count(host, 'fade:true'), 1);
        });

        it('stepping out of the doorway cancels the walk-in; loading goes on', async () => {
            manager.update(nearHallDoor, 'walk', false, QUIET);
            manager.update(inHallDoor, 'walk', false);
            manager.update(nearHallDoor, 'walk', false);
            assert.deepEqual(manager.doorState(0), { load: 'loading', progress: 0, pending: null });

            lastLoad(host, 'tunnel').resolve('tunnel-instance');
            await flush();
            lastReady(host, 'tunnel').resolve();
            await flush();
            manager.update(nearHallDoor, 'walk', false);
            assert.equal(manager.busy, false);
            assert.equal(count(host, 'fade:true'), 0);
            assert.equal(manager.doorState(0).load, 'ready');
        });

        it('leaving fly/walk mode, or starting XR, cancels the walk-in', () => {
            manager.update(nearHallDoor, 'walk', false, QUIET);
            manager.update(inHallDoor, 'walk', false);
            manager.update(inHallDoor, 'orbit', false);
            assert.equal(manager.doorState(0).pending, null);

            manager.update(nearHallDoor, 'fly', false);
            manager.update(inHallDoor, 'fly', false);
            assert.equal(manager.doorState(0).pending, 'walk');
            manager.update(inHallDoor, 'fly', true);
            assert.equal(manager.doorState(0).pending, null);
        });

        it('a cancelled walk-in must leave the doorway before it triggers again', () => {
            manager.update(nearHallDoor, 'walk', false, QUIET);
            manager.update(inHallDoor, 'walk', false);
            manager.update(inHallDoor, 'orbit', false);
            manager.update(inHallDoor, 'walk', false);
            assert.equal(manager.doorState(0).pending, null);
            manager.update(nearHallDoor, 'walk', false);
            manager.update(inHallDoor, 'walk', false);
            assert.equal(manager.doorState(0).pending, 'walk');
        });

        it('tapping starts the load at once, without waiting for a quiet frame', async () => {
            manager.update(nearHallDoor, 'orbit', false);
            await manager.enter(0);
            assert.deepEqual(host.calls, ['load:tunnel']);
            assert.deepEqual(manager.doorState(0), { load: 'loading', progress: 0, pending: 'tap' });
        });

        it('a tapped door goes through once ready, wherever the visitor is', async () => {
            await manager.enter(0);
            manager.update(farAway, 'orbit', false);
            lastLoad(host, 'tunnel').resolve('tunnel-instance');
            await flush();
            lastReady(host, 'tunnel').resolve();
            await flush();
            manager.update(farAway, 'orbit', false);
            assert.equal(manager.busy, true);
            await flush();
            await flush();
            assert.equal(manager.current.id, 'tunnel');
        });

        it('tapping again cancels; loading goes on and the room is ready for later', async () => {
            await manager.enter(0);
            await manager.enter(0);
            assert.deepEqual(manager.doorState(0), { load: 'loading', progress: 0, pending: null });

            lastLoad(host, 'tunnel').resolve('tunnel-instance');
            await flush();
            lastReady(host, 'tunnel').resolve();
            await flush();
            manager.update(farAway, 'orbit', false);
            assert.equal(manager.busy, false);
            assert.equal(manager.doorState(0).load, 'ready');
        });

        it('a tap keeps the slot: walking near another door does not replace the tapped room', async () => {
            host = fakeHost();
            manager = new RoomManager(threeRooms(), 'hall-instance', host);
            manager.start();
            manager.update(at(0, 0, 0), 'orbit', false, QUIET);
            await manager.enter(1); // the cellar
            manager.update(at(18, 0, 0), 'orbit', false);
            assert.equal(count(host, 'load:tunnel'), 1);
            assert.equal(count(host, 'load:cellar'), 1);
            assert.equal(count(host, 'release:cellar'), 0);
        });

        it('tapping a failed door retries it', async () => {
            manager.update(nearHallDoor, 'orbit', false, QUIET);
            lastLoad(host, 'tunnel').reject(new Error('404'));
            await flush();
            assert.equal(manager.doorState(0).load, 'failed');

            await manager.enter(0);
            assert.equal(count(host, 'load:tunnel'), 2);
            assert.deepEqual(manager.doorState(0), { load: 'loading', progress: 0, pending: 'tap' });
        });

        it('a load failing while pending clears the request and shows the door as failed', async () => {
            await manager.enter(0);
            lastLoad(host, 'tunnel').reject(new Error('404'));
            await flush();
            assert.deepEqual(manager.doorState(0), { load: 'failed', progress: 0, pending: null });
            assert.equal(count(host, 'fade:true'), 0);
            assert.equal(manager.busy, false);
            assert.equal(warnings(host).length, 1);
        });

        it('a walk-in into a failed door does not pend; a fresh approach retries', async () => {
            manager.update(nearHallDoor, 'walk', false, QUIET);
            lastLoad(host, 'tunnel').reject(new Error('404'));
            await flush();
            manager.update(inHallDoor, 'walk', false);
            assert.equal(manager.doorState(0).pending, null);
            assert.equal(count(host, 'load:tunnel'), 1);
        });
    });

    describe('destroy()', () => {
        beforeEach(() => manager.start());

        it('releases a parked room', async () => {
            manager.update(nearHallDoor, 'orbit', false, QUIET);
            lastLoad(host, 'tunnel').resolve('tunnel-instance');
            await flush();
            manager.destroy();
            assert.equal(count(host, 'release:tunnel'), 1);
            manager.update(inHallDoor, 'walk', false);
            assert.equal(count(host, 'fade:true'), 0);
        });

        it('releases a parked room whose load is still pending once it resolves', async () => {
            manager.update(nearHallDoor, 'orbit', false, QUIET);
            manager.destroy();
            lastLoad(host, 'tunnel').resolve('tunnel-instance');
            await flush();
            assert.equal(count(host, 'release:tunnel'), 1);
            assert.equal(count(host, 'ready:tunnel'), 0);
        });

        it('during a transition stops it', async () => {
            let fadeOut;
            host.fade = (opaque) => {
                host.calls.push(`fade:${opaque}`);
                if (!opaque) return Promise.resolve();
                fadeOut = deferred();
                return fadeOut.promise;
            };
            await preloadTunnel(manager, host);
            const done = manager.enter(0);
            manager.destroy();
            fadeOut.resolve();
            await done;
            assert.equal(count(host, 'activate:tunnel'), 0);
            assert.equal(count(host, 'release:hall'), 0);
            assert.equal(count(host, 'release:tunnel'), 1);
        });
    });
});

describe('RoomManager when the host throws', () => {
    let host;
    let manager;
    let unhandled;
    const onUnhandled = (reason) => unhandled.push(reason);

    beforeEach(() => {
        unhandled = [];
        process.on('unhandledRejection', onUnhandled);
        host = fakeHost();
        manager = new RoomManager(specRooms(), 'hall-instance', host);
        manager.start();
    });

    afterEach(() => {
        process.off('unhandledRejection', onUnhandled);
    });

    // Walks into the hall door with the tunnel preloaded and ready.
    const walkIn = async () => {
        await preloadTunnel(manager, host);
        manager.update(inHallDoor, 'walk', false);
        await flush();
        await flush();
    };

    it('activate throwing: fades back in, warns, stays in the hall, not busy, no unhandled rejection', async () => {
        host.activate = (instance) => {
            host.calls.push(`activate:${name(instance)}`);
            throw new Error('activate broke');
        };
        await walkIn();

        assert.equal(manager.busy, false);
        assert.equal(manager.current.id, 'hall');
        assert.ok(host.calls.indexOf('fade:false') > host.calls.indexOf('activate:tunnel'));
        assert.equal(warnings(host).length, 1);
        assert.match(warnings(host)[0], /activate broke/);
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
        assert.equal(warnings(host).length, 1);
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
        assert.equal(warnings(host).length, 1);
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
        assert.equal(warnings(host).length, 1);
        assert.deepEqual(unhandled, []);
    });

    it('fade out throwing: not busy, warned, no unhandled rejection', async () => {
        host.fade = (opaque) => {
            host.calls.push(`fade:${opaque}`);
            if (opaque) throw new Error('fade broke');
            return Promise.resolve();
        };
        await walkIn();

        assert.equal(manager.busy, false);
        assert.equal(manager.current.id, 'hall');
        assert.equal(count(host, 'fade:false'), 1);
        assert.equal(warnings(host).length, 1);
        assert.deepEqual(unhandled, []);
    });

    it('progress() throwing does not break doorState()', async () => {
        host.progress = () => {
            throw new Error('progress broke');
        };
        manager.update(nearHallDoor, 'orbit', false, QUIET);
        lastLoad(host, 'tunnel').resolve('tunnel-instance');
        await flush();
        assert.deepEqual(manager.doorState(0), { load: 'loading', progress: 0, pending: null });
    });

    describe('aborting and XR', () => {
        it('enter() is ignored during an XR session', async () => {
            manager = new RoomManager(specRooms(), 'hall-instance', host, () => true);
            manager.start();
            await manager.enter(0);
            await flush();
            assert.deepEqual(host.calls, []);
        });

        it('replacing a preloading room aborts its load', async () => {
            manager = new RoomManager(threeRooms(), 'hall-instance', host);
            manager.start();
            manager.update(at(16, 0, 0), 'walk', false, QUIET);
            const tunnel = lastLoad(host, 'tunnel');
            assert.equal(tunnel.signal.aborted, false);
            manager.update(at(-16, 0, 0), 'walk', false, QUIET);
            assert.equal(count(host, 'load:cellar'), 1);
            assert.equal(tunnel.signal.aborted, true);
            assert.equal(lastLoad(host, 'cellar').signal.aborted, false);
        });

        it('destroy() aborts a preload in flight', () => {
            manager.start();
            manager.update(nearHallDoor, 'walk', false, QUIET);
            const tunnel = lastLoad(host, 'tunnel');
            manager.destroy();
            assert.equal(tunnel.signal.aborted, true);
        });
    });
});
