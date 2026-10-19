// The engine side of the room manager: loads a room parked out of sight, tells when its parked
// level is resident, swaps it in through the viewer and frees it again.

import type { Asset, Entity, GSplatComponent } from 'playcanvas';

import { loadGsplat } from '../load-gsplat';
import { importSettings } from '../settings';
import type { ExperienceSettings } from '../settings';
import type { Global } from '../types';
import type { Viewer } from '../viewer';

import type { FadeOverlay } from './fade-overlay';
import { READY_STALL_TIMEOUT_MS, createReadyWatch } from './ready-watch';
import type { RoomHost } from './room-manager';
import type { RoomDef } from './rooms-settings';

type RoomInstance = { id: string; entity: Entity; asset: Asset; settings: ExperienceSettings };

// Where a room waits while it preloads: 1 km below the current room, beyond the camera's far
// clip (fitted to the current room's bounds), so it is never drawn.
const PARK_OFFSET: [number, number, number] = [0, -1000, 0];

// The detail level a parked room is held at (0 is the finest): a useful whole-room level that
// the fade can wait for, or the coarsest level when a room has fewer.
const PARK_LEVEL = 2;

// How often a readiness wait checks itself when no frame does.
const READY_CHECK_INTERVAL_MS = 1000;

type OctreeLike = {
    lodLevels: number;
    files: { lodLevel: number }[];
    fileResources: Map<number, unknown>;
};

const octreeOf = (entity: Entity): OctreeLike | null => {
    const resource = (entity.gsplat as GSplatComponent | undefined)?.resource as
        { octree?: OctreeLike | null } | null | undefined;
    return resource?.octree ?? null;
};

const parkLevel = (octree: OctreeLike) => Math.max(0, Math.min(PARK_LEVEL, octree.lodLevels - 1));

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const createRoomHost = (
    global: Global,
    viewer: Viewer,
    overlay: FadeOverlay,
    firstRoomId: string
): RoomHost<RoomInstance> => {
    const { app } = global;

    // the first room's settings, for rooms without a settings file of their own
    const firstSettings = global.settings;

    // readiness waits, cancelled when their room is released
    const waits = new Map<RoomInstance, (err: Error) => void>();

    const warn = (message: string) => {
        console.warn('[rooms]', message);
    };

    // The first room is the page's own scene, whatever its entry says: going back to it reloads
    // the page's content with the page's settings.
    const isFirst = (room: RoomDef) => room.id === firstRoomId;

    const loadSettings = async (room: RoomDef): Promise<ExperienceSettings> => {
        if (isFirst(room)) return firstSettings;
        if (!room.settingsUrl) {
            // the first room's look, without its exhibits, start cameras or camera animation
            return { ...firstSettings, annotations: [], cameras: [], animTracks: [] };
        }
        const response = await fetch(room.settingsUrl);
        if (!response.ok) {
            throw new Error(`settings "${room.settingsUrl}": ${response.status} ${response.statusText}`);
        }
        return importSettings(await response.json());
    };

    return {
        async load(room: RoomDef): Promise<RoomInstance> {
            const { config } = global;
            const first = isFirst(room);
            if (!first && !room.contentUrl) {
                throw new Error(`room "${room.id}" has no contentUrl`);
            }
            // the page's prefetched response was consumed by the first load, so it is not reused
            const source = first
                ? { contentUrl: config.contentUrl, contentFilename: config.contentFilename }
                : { contentUrl: room.contentUrl };
            const settings = await loadSettings(room);
            if (viewer.destroyed) {
                throw new Error('the viewer was destroyed while loading');
            }

            const { entity, asset } = await loadGsplat(
                app,
                source,
                () => {
                    // a background load has no progress bar
                },
                () => viewer.destroyed
            );

            // Runs as a microtask of the asset's load event, so no frame draws it unparked or
            // streams it uncapped.
            entity.setLocalPosition(...PARK_OFFSET);
            const octree = octreeOf(entity);
            if (octree) {
                const component = entity.gsplat as GSplatComponent;
                component.lodRangeMin = component.lodRangeMax = parkLevel(octree);
            }
            // rendering is on demand: a frame starts the parked room streaming
            app.renderNextFrame = true;

            return { id: room.id, entity, asset, settings };
        },

        whenReady(instance: RoomInstance): Promise<void> {
            const octree = octreeOf(instance.entity);
            // single-file formats are complete once their asset has loaded
            if (!octree) return Promise.resolve();

            const level = parkLevel(octree);
            const files: number[] = [];
            octree.files.forEach((file, index) => {
                if (file.lodLevel === level) files.push(index);
            });
            const residentCount = () => files.reduce((n, index) => n + (octree.fileResources.has(index) ? 1 : 0), 0);
            if (residentCount() === files.length) return Promise.resolve();

            return new Promise<void>((resolve, reject) => {
                const system = app.systems.gsplat;
                const watch = createReadyWatch(files.length, performance.now());

                // checked on every frame, and on a timer too, so a stall is noticed even when
                // nothing renders
                const timer = setInterval(() => check(), READY_CHECK_INTERVAL_MS);
                const stop = () => {
                    system.off('frame:ready', check);
                    clearInterval(timer);
                    waits.delete(instance);
                };
                const fail = (err: Error) => {
                    stop();
                    reject(err);
                };
                const check = () => {
                    if (viewer.destroyed) {
                        fail(new Error('the viewer was destroyed'));
                        return;
                    }
                    const count = residentCount();
                    const state = watch(count, performance.now(), document.hidden);
                    if (state === 'ready') {
                        stop();
                        resolve();
                    } else if (state === 'stalled') {
                        fail(
                            new Error(
                                `room "${instance.id}" stopped loading: ${count} of ${files.length} files of ` +
                                    `level ${level} arrived, none in the last ${READY_STALL_TIMEOUT_MS / 1000} s`
                            )
                        );
                    } else {
                        // streaming advances only on rendered frames, and the screen is black
                        // and still while this waits
                        app.renderNextFrame = true;
                    }
                };
                waits.set(instance, fail);
                system.on('frame:ready', check);
                check();
            });
        },

        activate(instance: RoomInstance, room: RoomDef, arrival) {
            const setRoom = viewer.setRoom;
            if (!setRoom) {
                throw new Error('the viewer has not finished loading its first room');
            }
            instance.entity.setLocalPosition(0, 0, 0);
            try {
                setRoom({ id: room.id, entity: instance.entity, settings: instance.settings }, arrival);
            } catch (err) {
                // Part of the viewer may already be in the new room (its settings, bounds or
                // camera), so going back is not possible: the room counts as switched, and the
                // manager releases the old one and fades in as usual.
                warn(`room "${room.id}" was only partly set up: ${describeError(err)}`);
            }
        },

        release(instance: RoomInstance) {
            waits.get(instance)?.(new Error(`room "${instance.id}" was released`));
            const { entity, asset } = instance;
            try {
                entity.destroy();
                // destroying the entity alone keeps its tiles on the gpu; unloading frees them
                asset.unload();
                app.assets.remove(asset);
            } catch (err) {
                warn(`could not release room "${instance.id}": ${describeError(err)}`);
            }
            app.renderNextFrame = true;
        },

        fade(opaque: boolean) {
            return overlay.fade(opaque);
        },

        setWaiting(on: boolean) {
            overlay.setWaiting(on);
        },

        warn
    };
};

// The first room's instance, from the scene the page loaded.
const firstRoomInstance = (global: Global, id: string, entity: Entity): RoomInstance => {
    const component = entity.gsplat as GSplatComponent;
    const ref = component.asset;
    const asset = typeof ref === 'number' ? global.app.assets.get(ref) : ref;
    return { id, entity, asset, settings: global.settings };
};

export { PARK_LEVEL, PARK_OFFSET, createRoomHost, firstRoomInstance };
export type { RoomInstance };
