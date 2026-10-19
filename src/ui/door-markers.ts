import { Vec3 } from 'playcanvas';
import type { AppBase, Entity } from 'playcanvas';

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
    position: Vec3;
    // the distance fade as last written to its style, so a still marker is not restyled
    fade: number;
};

/**
 * The current room's doors drawn over the scene: a rippling point at each door's centre, in the
 * annotation hotspots' look, labelled with the room it leads to. Tapping one goes through the
 * door. They fade with distance like the hotspots, and sit in a layer of their own, so the "show
 * annotations" toggle does not hide them.
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
     */
    constructor(
        app: AppBase,
        camera: Entity,
        layer: HTMLElement,
        doors: readonly DoorDef[],
        onEnter: (index: number) => void
    ) {
        this.layer = document.createElement('div');
        this.layer.className = 'sse-doorMarkers';
        layer.appendChild(this.layer);

        // ripples are played here rather than by a css animation, whose @keyframes name would be
        // global; checked once, as the hotspots do
        const animate = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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

            // the destination's name as the settings write it (the museum writes Persian)
            const label = document.createElement('span');
            label.className = 'sse-doorMarker-label';
            label.dir = 'auto';
            label.textContent = door.label;
            element.appendChild(label);

            // kept from the scene beneath, so the tap does not also deselect or navigate
            element.addEventListener('click', (event) => {
                event.stopPropagation();
                onEnter(index);
            });

            this.layer.appendChild(element);
            return { element, position: new Vec3(door.center[0], door.center[1], door.center[2]), fade: 1 };
        });

        const update = () => {
            for (const marker of markers) {
                const { element, position } = marker;

                // behind the camera: hidden
                camera.camera.viewMatrix.transformPoint(position, vec);
                if (vec.z >= 0) {
                    element.style.display = 'none';
                    continue;
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
                }
            }
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
