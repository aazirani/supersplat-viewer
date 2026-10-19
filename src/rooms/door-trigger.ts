// Decides, per frame, which rooms to preload and whether the camera walked through a door. Pure so
// Node can run it in tests.

import type { CameraMode } from '../types.ts';

import type { DoorDef } from './rooms-settings.ts';

type Point = { x: number; y: number; z: number };
type DoorDecision = { preload: string[]; enter: number | null; armed: boolean[] };

const insideDoor = (door: DoorDef, p: Point): boolean =>
    Math.abs(p.x - door.center[0]) <= door.size[0] / 2 &&
    Math.abs(p.y - door.center[1]) <= door.size[1] / 2 &&
    Math.abs(p.z - door.center[2]) <= door.size[2] / 2;

const evaluateDoors = (
    doors: readonly DoorDef[],
    p: Point,
    mode: CameraMode,
    xrActive: boolean,
    armed: readonly boolean[]
): DoorDecision => {
    const canEnter = (mode === 'fly' || mode === 'walk') && !xrActive;
    const preload: string[] = [];
    const nextArmed = doors.map((_, i) => armed[i] ?? false);
    let enter: number | null = null;

    doors.forEach((door, i) => {
        const dist = Math.hypot(p.x - door.center[0], p.y - door.center[1], p.z - door.center[2]);
        if (dist <= door.preloadRadius && !preload.includes(door.to)) preload.push(door.to);

        const inside = insideDoor(door, p);
        if (!inside) {
            nextArmed[i] = true;
        } else if (nextArmed[i] && canEnter && enter === null) {
            enter = i;
        }
    });

    return { preload, enter, armed: nextArmed };
};

export { insideDoor, evaluateDoors };
export type { Point, DoorDecision };
