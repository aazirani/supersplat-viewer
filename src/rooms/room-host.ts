// The engine side of the room manager: loads a room parked out of sight, tells when its parked
// level is resident and how far along it is, swaps it in through the viewer and frees it again.

import type { AppBase, Asset, Entity, GSplatComponent } from 'playcanvas';

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

// How often a readiness wait checks itself, and asks for a frame so the streamer takes in what
// has downloaded, while no frame does.
const READY_CHECK_INTERVAL_MS = 1000;

type OctreeLike = {
    lodLevels: number;
    files: { lodLevel: number; url: string }[];
    fileResources: Map<number, unknown>;
};

const octreeOf = (entity: Entity): OctreeLike | null => {
    const resource = (entity.gsplat as GSplatComponent | undefined)?.resource as
        { octree?: OctreeLike | null } | null | undefined;
    return resource?.octree ?? null;
};

// The detail level a parked room is held at: the coarsest, which is also what the page waits for
// before its own first reveal. The finer levels stream in once the room is entered, as they do
// after that reveal.
const parkLevel = (octree: OctreeLike) => octree.lodLevels - 1;

// The progress of a level's files, in files: a resident file counts 1, a downloading one its
// downloaded part (short of 1 until it is resident, since a downloaded file still has to be
// parsed). Read from the progress events of the engine's per-file assets, which exist once the
// streamer has requested the file.
type LevelProgress = { total: number; progress(): number; dispose(): void };

const trackLevel = (app: AppBase, octree: OctreeLike, level: number): LevelProgress => {
    const files: number[] = [];
    octree.files.forEach((file, index) => {
        if (file.lodLevel === level) files.push(index);
    });
    const parts = new Map<number, number>();
    const watched = new Map<Asset, () => void>();

    const watch = (index: number) => {
        const asset = app.assets.getByUrl(octree.files[index].url);
        if (!asset || watched.has(asset)) return;
        const onProgress = (received: number, length: number) => {
            if (length > 0) parts.set(index, Math.max(parts.get(index) ?? 0, Math.min(0.99, received / length)));
        };
        asset.on('progress', onProgress);
        watched.set(asset, () => asset.off('progress', onProgress));
    };

    return {
        total: files.length,
        progress() {
            let sum = 0;
            for (const index of files) {
                if (octree.fileResources.has(index)) {
                    sum += 1;
                } else {
                    watch(index);
                    sum += parts.get(index) ?? 0;
                }
            }
            return sum;
        },
        dispose() {
            for (const off of watched.values()) off();
            watched.clear();
        }
    };
};

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

    // the parked level's progress of each loaded octree room, until it is released
    const levels = new Map<RoomInstance, LevelProgress>();

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
            const instance: RoomInstance = { id: room.id, entity, asset, settings };
            const octree = octreeOf(entity);
            if (octree) {
                const component = entity.gsplat as GSplatComponent;
                const level = parkLevel(octree);
                component.lodRangeMin = component.lodRangeMax = level;
                levels.set(instance, trackLevel(app, octree, level));
            }
            // rendering is on demand: a frame starts the parked room streaming
            app.renderNextFrame = true;

            return instance;
        },

        whenReady(instance: RoomInstance): Promise<void> {
            const level = levels.get(instance);
            // single-file formats are complete once their asset has loaded
            if (!level || level.progress() >= level.total) return Promise.resolve();

            return new Promise<void>((resolve, reject) => {
                const system = app.systems.gsplat;
                const watch = createReadyWatch(level.total, performance.now());

                // checked on every frame, and on a timer too, so a stall is noticed and a
                // downloaded file is taken in even when nothing renders
                const onFrame = () => check(false);
                const timer = setInterval(() => check(true), READY_CHECK_INTERVAL_MS);
                const stop = () => {
                    system.off('frame:ready', onFrame);
                    clearInterval(timer);
                    waits.delete(instance);
                };
                const fail = (err: Error) => {
                    stop();
                    reject(err);
                };
                const check = (requestFrame: boolean) => {
                    if (viewer.destroyed) {
                        fail(new Error('the viewer was destroyed'));
                        return;
                    }
                    const progress = level.progress();
                    const state = watch(progress, performance.now(), document.hidden);
                    if (state === 'ready') {
                        stop();
                        // the door's marker shows the change on the next frame
                        app.renderNextFrame = true;
                        resolve();
                    } else if (state === 'stalled') {
                        app.renderNextFrame = true;
                        fail(
                            new Error(
                                `room "${instance.id}" stopped loading: ${Math.floor(progress)} of ${level.total} ` +
                                    `files of its coarsest level arrived, nothing in the last ${READY_STALL_TIMEOUT_MS / 1000} s`
                            )
                        );
                    } else if (requestFrame) {
                        // a downloaded file becomes resident only on a rendered frame, and the
                        // camera may be still
                        app.renderNextFrame = true;
                    }
                };
                waits.set(instance, fail);
                system.on('frame:ready', onFrame);
                check(false);
            });
        },

        progress(instance: RoomInstance): number {
            const level = levels.get(instance);
            if (!level) return 1;
            return level.total > 0 ? level.progress() / level.total : 1;
        },

        activate(instance: RoomInstance, room: RoomDef, arrival) {
            const setRoom = viewer.setRoom;
            if (!setRoom) {
                throw new Error('the viewer has not finished loading its first room');
            }
            instance.entity.setLocalPosition(0, 0, 0);
            levels.get(instance)?.dispose();
            levels.delete(instance);
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
            levels.get(instance)?.dispose();
            levels.delete(instance);
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

export { PARK_OFFSET, createRoomHost, firstRoomInstance };
export type { RoomInstance };
