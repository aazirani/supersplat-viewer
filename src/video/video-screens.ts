// The scene's video screens and sound, wired to the viewer: built from the current room's
// settings once its scene has loaded, rebuilt for each room, following the camera every update.

import type { Entity } from 'playcanvas';

import type { Global } from '../types';
import type { Viewer } from '../viewer';

import { SpatialAudio } from './spatial-audio';
import { VideoScreen } from './video-screen';
import { readVideos } from './videos-settings';

const initVideoScreens = (global: Global, viewer: Viewer, gsplatLoad: Promise<Entity>) => {
    const { app, events, state, root } = global;
    const warn = (message: string) => {
        console.warn('[video]', message);
    };

    // a scene with nothing to play, and no rooms that could bring something, costs nothing
    const settings = global.settings;
    const hasRooms = Array.isArray(settings.rooms) && settings.rooms.length >= 2;
    if (settings.videos === undefined && settings.soundUrl === undefined && !hasRooms) return;

    gsplatLoad.then(
        (entity) => {
            if (viewer.destroyed) return;

            const audio = new SpatialAudio(root, warn);
            let screens: VideoScreen[] = [];
            const distances = new Map<VideoScreen, number>();

            // the current room's screens, on its gsplat entity, and its ambient track
            const build = (parent: Entity) => {
                const { videos, warnings } = readVideos(global.settings.videos);
                for (const warning of warnings) warn(warning);
                screens = videos.map((def) => {
                    const screen = new VideoScreen(app, parent, def, warn);
                    if (def.sound && !screen.failed) audio.attach(screen, def.sound);
                    screen.setHidden(document.hidden);
                    return screen;
                });
                audio.ambient(global.settings.soundUrl ?? null);
            };

            const clear = () => {
                for (const screen of screens) {
                    audio.detach(screen);
                    screen.destroy();
                }
                screens = [];
                distances.clear();
            };

            build(viewer.currentGsplat ?? entity);

            // the viewer has swapped in the room's settings and entity by the time it announces
            // the room; the first announcement, of the page's own room, changes nothing
            const roomChanged = events.on('room:changed', (_room: string | null, previous: string | null) => {
                if (previous === null) return;
                clear();
                const parent = viewer.currentGsplat;
                if (parent) build(parent);
            });

            const update = () => {
                if (screens.length === 0) return;
                const position = viewer.cameraManager?.camera.position ?? global.camera.getPosition();
                for (const screen of screens) {
                    if (screen.failed) continue;
                    const distance = screen.center.distance(position);
                    screen.setDistance(distance);
                    distances.set(screen, distance);
                }
                audio.update(global.camera, distances);
            };
            app.on('update', update);

            const onVisibility = () => {
                const { hidden } = document;
                for (const screen of screens) screen.setHidden(hidden);
                audio.setHidden(hidden);
            };
            document.addEventListener('visibilitychange', onVisibility);

            const mutedChanged = events.on('muted:changed', (muted: boolean) => audio.setMuted(muted));
            audio.setMuted(state.muted);
            audio.setHidden(document.hidden);

            viewer.onDestroy(() => {
                roomChanged.off();
                mutedChanged.off();
                app.off('update', update);
                document.removeEventListener('visibilitychange', onVisibility);
                clear();
                audio.destroy();
            });
        },
        () => {
            // the first scene failed to load or the viewer was destroyed: nothing to play on
        }
    );
};

export { initVideoScreens };
