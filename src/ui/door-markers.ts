import { Vec3 } from 'playcanvas';
import type { AppBase, Entity } from 'playcanvas';

import type { Localize } from '../localization';
import type { DoorState } from '../rooms/room-manager';
import type { DoorDef } from '../rooms/rooms-settings';

import { distanceFade } from './hotspot-fade';

const vec = new Vec3();

// as the annotation hotspots (ui/annotation.ts): fully shown up to the near distance from the
// camera, in scene units, gone from the far one on
const FADE_NEAR = 4;
const FADE_FAR = 12;

// one ripple's spread from the marker, and the pause before the next, as the hotspots'
const RIPPLE_MS = 2600;

type Marker = {
    element: HTMLDivElement;
    status: HTMLSpanElement;
    position: Vec3;
    // the distance fade as last written to its style, so a still marker is not restyled
    fade: number;
    // the state as last shown, so a marker whose room is unchanged is not restyled
    shown: string;
};

/**
 * The current room's doors drawn over the scene: a rippling point at each door's centre, in the
 * annotation hotspots' look, labelled with the room it leads to. Tapping one goes through the
 * door. They fade with distance like the hotspots, and sit in a layer of their own, so the "show
 * annotations" toggle does not hide them.
 *
 * Each marker also shows how its room is doing, read from the room manager every frame: a ring
 * filling up while the room loads, with the progress and (for a tapped door) how to cancel under
 * the name, a dimmed marker for a room that could not be loaded.
 *
 * Styles live in `index.scss`, under `.sse-doorMarkers`.
 */
class DoorMarkers {
    private layer: HTMLDivElement;

    private removePrerender: () => void;

    /**
     * @param app - The app whose frames position the markers.
     * @param camera - The camera the markers are projected through.
     * @param layer - The scene layer the markers' own layer is added to.
     * @param doors - The current room's doors, in settings order.
     * @param onEnter - Called with a door's index when its marker is tapped.
     * @param stateOf - The state of a door's room, by the door's index.
     * @param localize - The ui strings.
     * @param lang - The ui locale, for the percentage's digits.
     */
    constructor(
        app: AppBase,
        camera: Entity,
        layer: HTMLElement,
        doors: readonly DoorDef[],
        onEnter: (index: number) => void,
        stateOf: (index: number) => DoorState,
        localize: Localize,
        lang: string
    ) {
        this.layer = document.createElement('div');
        this.layer.className = 'sse-doorMarkers';
        layer.appendChild(this.layer);

        // ripples are played here rather than by a css animation, whose @keyframes name would be
        // global; checked once, as the hotspots do
        const animate = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        // the ring's fade goes with the ripple
        this.layer.classList.toggle('sse-instant', !animate);

        let percent: Intl.NumberFormat;
        try {
            percent = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 });
        } catch {
            percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });
        }

        const markers: Marker[] = doors.map((door, index) => {
            const element = document.createElement('div');
            element.className = 'sse-doorMarker';
            element.setAttribute('role', 'button');
            element.setAttribute('aria-label', door.label);

            // a ring spreading out from the point now and then, so it reads as something to touch
            const ripple = document.createElement('span');
            ripple.className = 'sse-annotation-ripple';
            element.appendChild(ripple);
            if (animate) {
                ripple.animate(
                    [
                        { transform: 'scale(0.35)', opacity: 0.9 },
                        { transform: 'scale(1)', opacity: 0, offset: 0.7 },
                        { transform: 'scale(1)', opacity: 0 }
                    ],
                    {
                        duration: RIPPLE_MS,
                        delay: -Math.random() * RIPPLE_MS,
                        easing: 'ease-out',
                        iterations: Infinity
                    }
                );
            }

            // a ring around the point that fills clockwise as the room loads
            const ring = document.createElement('span');
            ring.className = 'sse-doorMarker-ring';
            element.appendChild(ring);

            // the destination's name as the settings write it (the museum writes Persian), with
            // the room's progress under it while it loads
            const label = document.createElement('span');
            label.className = 'sse-doorMarker-label';
            const title = document.createElement('span');
            title.className = 'sse-doorMarker-name';
            title.dir = 'auto';
            title.textContent = door.label;
            label.appendChild(title);
            const status = document.createElement('span');
            status.className = 'sse-doorMarker-status';
            status.dir = 'auto';
            label.appendChild(status);
            element.appendChild(label);

            // kept from the scene beneath, so the tap does not also deselect or navigate
            element.addEventListener('click', (event) => {
                event.stopPropagation();
                onEnter(index);
            });

            // reachable by keyboard, like the button it says it is: orbit mode has no other way
            // through a door. A far marker leaves the tab order
            element.tabIndex = 0;
            element.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onEnter(index);
                }
            });

            this.layer.appendChild(element);
            return {
                element,
                status,
                position: new Vec3(door.center[0], door.center[1], door.center[2]),
                fade: 1,
                shown: ''
            };
        });

        const show = (marker: Marker, state: DoorState) => {
            const { element } = marker;
            const loading = state.load === 'loading';
            const pct = loading ? Math.round(state.progress * 100) : 0;
            const key = `${state.load}:${pct}:${state.pending ?? ''}`;
            if (key === marker.shown) return;
            marker.shown = key;

            element.classList.toggle('sse-loading', loading);
            element.classList.toggle('sse-failed', state.load === 'failed');
            element.classList.toggle('sse-pending', state.pending !== null);
            element.style.setProperty('--sse-door-progress', String(loading ? state.progress : 0));

            let text = '';
            if (loading) {
                text =
                    pct > 0
                        ? localize('door.loading-percent').replace('{percent}', percent.format(pct / 100))
                        : localize('door.loading');
                if (state.pending === 'tap') text += ` · ${localize('door.cancel')}`;
            } else if (state.load === 'failed') {
                text = localize('door.unavailable');
            }
            marker.status.textContent = text;
            marker.status.hidden = text === '';
        };

        const update = () => {
            markers.forEach((marker, index) => {
                const { element, position } = marker;

                show(marker, stateOf(index));

                // behind the camera: hidden
                camera.camera.viewMatrix.transformPoint(position, vec);
                if (vec.z >= 0) {
                    element.style.display = 'none';
                    return;
                }

                // a transform rather than left/top, so moving it each frame does not trigger layout
                const screen = camera.camera.worldToScreen(position);
                element.style.display = 'flex';
                element.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -50%)`;

                const fade =
                    Math.round(distanceFade(camera.getPosition().distance(position), FADE_NEAR, FADE_FAR) * 100) / 100;
                if (fade !== marker.fade) {
                    marker.fade = fade;
                    element.style.setProperty('--sse-hotspot-fade', String(fade));
                    element.classList.toggle('sse-far', fade === 0);
                    element.tabIndex = fade === 0 ? -1 : 0;
                }
            });
        };
        app.on('prerender', update);
        this.removePrerender = () => app.off('prerender', update);

        // a still camera would not draw the frame that places them
        app.renderNextFrame = true;
    }

    destroy() {
        this.removePrerender();
        this.layer.remove();
    }
}

export { DoorMarkers };
