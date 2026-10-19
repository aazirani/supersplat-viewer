// The engine side of the room manager: loads a room parked out of sight, tells when its parked
// level is resident, swaps it in through the viewer and frees it again.

import type { Asset, Entity, GSplatComponent } from 'playcanvas';

import { loadGsplat } from '../load-gsplat';
import { importSettings } from '../settings';
import type { ExperienceSettings } from '../settings';
import type { Global } from '../types';
import type { Viewer } from '../viewer';

import type { FadeOverlay } from './fade-overlay';
import type { RoomHost } from './room-manager';
import type { RoomDef } from './rooms-settings';

type RoomInstance = { id: string; entity: Entity; asset: Asset; settings: ExperienceSettings };

// Where a room waits while it preloads: 1 km below the current room, beyond the camera's far
// clip (fitted to the current room's bounds), so it is never drawn.
const PARK_OFFSET: [number, number, number] = [0, -1000, 0];

// The detail level a parked room is held at (0 is the finest): a useful whole-room level that
// the fade can wait for, or the coarsest level when a room has fewer.
const PARK_LEVEL = 2;

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

const createRoomHost = (global: Global, viewer: Viewer, overlay: FadeOverlay): RoomHost<RoomInstance> => {
    const { app } = global;

    // the first room's settings, for rooms without a settings file of their own
    const firstSettings = global.settings;

    // readiness waits, cancelled when their room is released
    const waits = new Map<RoomInstance, (err: Error) => void>();

    const warn = (message: string) => {
        console.warn('[rooms]', message);
    };

    // Where a room's splat and settings come from. Only the first room has no contentUrl
    // (readRooms requires one on the others): it is the page's own scene, so going back to it
    // reloads the page's content with the page's settings.
    const isFirst = (room: RoomDef) => !room.contentUrl;

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
            // the page's prefetched response was consumed by the first load, so it is not reused
            const source = isFirst(room)
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
            const resident = () => files.every((index) => octree.fileResources.has(index));
            if (resident()) return Promise.resolve();

            return new Promise<void>((resolve, reject) => {
                const system = app.systems.gsplat;
                const stop = () => {
                    system.off('frame:ready', check);
                    waits.delete(instance);
                };
                const check = () => {
                    if (viewer.destroyed) {
                        stop();
                        reject(new Error('the viewer was destroyed'));
                    } else if (resident()) {
                        stop();
                        resolve();
                    } else {
                        // streaming advances only on rendered frames, and the screen is black
                        // and still while this waits
                        app.renderNextFrame = true;
                    }
                };
                waits.set(instance, (err) => {
                    stop();
                    reject(err);
                });
                system.on('frame:ready', check);
                app.renderNextFrame = true;
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
                // the manager keeps it parked: put it back out of sight
                instance.entity.setLocalPosition(...PARK_OFFSET);
                throw err;
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
