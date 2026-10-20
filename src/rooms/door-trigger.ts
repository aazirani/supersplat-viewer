// Decides, per frame, which rooms to preload, which room is behind the nearest door, and whether
// the camera walked through a door. Pure so Node can run it in tests.

import type { CameraMode } from '../types.ts';

import type { ArrivalPose, DoorDef } from './rooms-settings.ts';

// The camera's position, with its view angles in degrees when known: `pitch` up from the
// horizon, `yaw` as the camera stores it (0 looks along -z, 90 along -x).
type Point = { x: number; y: number; z: number; yaw?: number; pitch?: number };
// `preload`: the rooms behind doors within their preload radius, in door order. `nearest`: the
// room behind the nearest door at any distance (null without doors), for preloading while no
// door is near.
type DoorDecision = { preload: string[]; nearest: string | null; enter: number | null; armed: boolean[] };

const insideDoor = (door: DoorDef, p: Point): boolean =>
    Math.abs(p.x - door.center[0]) <= door.size[0] / 2 &&
    Math.abs(p.y - door.center[1]) <= door.size[1] / 2 &&
    Math.abs(p.z - door.center[2]) <= door.size[2] / 2;

// Whether the camera's position can take it through a door: an orbiting camera can sweep through
// walls, and an XR session has no doors.
const canEnterByPosition = (mode: CameraMode, xrActive: boolean): boolean =>
    (mode === 'fly' || mode === 'walk') && !xrActive;

const evaluateDoors = (
    doors: readonly DoorDef[],
    p: Point,
    mode: CameraMode,
    xrActive: boolean,
    armed: readonly boolean[]
): DoorDecision => {
    const canEnter = canEnterByPosition(mode, xrActive);
    const preload: string[] = [];
    const nextArmed = doors.map((_, i) => armed[i] ?? false);
    let enter: number | null = null;
    let nearest: string | null = null;
    let nearestDist = Infinity;

    doors.forEach((door, i) => {
        const dist = Math.hypot(p.x - door.center[0], p.y - door.center[1], p.z - door.center[2]);
        if (dist <= door.preloadRadius && !preload.includes(door.to)) preload.push(door.to);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = door.to;
        }

        const inside = insideDoor(door, p);
        if (!inside) {
            nextArmed[i] = true;
        } else if (nextArmed[i] && canEnter && enter === null) {
            enter = i;
        }
    });

    return { preload, nearest, enter, armed: nextArmed };
};

const RAD = Math.PI / 180;

// The camera's yaw for a horizontal direction, as core/math's vecToAngles.
const yawOf = (x: number, z: number) => Math.atan2(-x, -z) / RAD;

// The arrival pose for a camera at `p` going through `door`, keeping its view relative to the
// door: the angle between the camera's view and the direction through the door is applied to
// the configured arrival's forward, and the camera's pitch is kept. Walking through backwards
// arrives looking back at the door. The direction through the door is along the door box's
// thinner horizontal side, from the side the camera stands on. The configured arrival is kept
// when `p` has no angles, stands on the door's centre plane, or the box is as deep as it is wide.
const arrivalThrough = (door: DoorDef, p: Point, arrival: ArrivalPose): ArrivalPose => {
    if (p.yaw === undefined || p.pitch === undefined) return arrival;
    const [sx, , sz] = door.size;
    if (sx === sz) return arrival;
    const axis = sx < sz ? 0 : 2;
    const side = door.center[axis] - (axis === 0 ? p.x : p.z);
    if (side === 0) return arrival;
    const through = axis === 0 ? yawOf(Math.sign(side), 0) : yawOf(0, Math.sign(side));

    const [px, py, pz] = arrival.position;
    const [tx, ty, tz] = arrival.target;
    const dx = tx - px;
    const dy = ty - py;
    const dz = tz - pz;
    const distance = Math.hypot(dx, dy, dz);
    if (dx === 0 && dz === 0) return arrival;

    const yaw = (yawOf(dx, dz) + (p.yaw - through)) * RAD;
    const pitch = p.pitch * RAD;
    const forward = [-Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
    return {
        position: [px, py, pz],
        target: [px + forward[0] * distance, py + forward[1] * distance, pz + forward[2] * distance]
    };
};

export { arrivalThrough, canEnterByPosition, insideDoor, evaluateDoors };
export type { Point, DoorDecision };
