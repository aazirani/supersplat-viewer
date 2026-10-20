// Runs the rooms at runtime: keeps at most one destination room parked in the background, and
// swaps rooms behind a fade once the destination is ready. A door entered before its room is ready
// never fades: the visitor waits in the current room (the door's marker shows the progress) and
// goes through the moment the room is ready. Engine free (the host does the loading, fading and
// scene work) so Node can run it in tests.

import type { CameraMode } from '../types.ts';

import { arrivalThrough, canEnterByPosition, evaluateDoors, insideDoor } from './door-trigger.ts';
import type { Point } from './door-trigger.ts';
import type { ArrivalPose, RoomDef } from './rooms-settings.ts';

type RoomHost<R> = {
    // creates the room parked and hidden
    // `signal` aborts when the room is no longer wanted (replaced in the slot, or destroyed)
    load(room: RoomDef, signal: AbortSignal): Promise<R>;
    // resolves when the parked level is resident; rejects when it stops loading
    whenReady(instance: R): Promise<void>;
    // how much of the parked level has arrived, 0 to 1, while whenReady is pending
    progress(instance: R): number;
    // unpark + viewer.setRoom
    activate(instance: R, room: RoomDef, arrival: ArrivalPose): void;
    // destroy entity + unload asset
    release(instance: R): void;
    fade(opaque: boolean): Promise<void>;
    warn(message: string): void;
};

// What a door's marker shows. `load` is the destination's: `failed` until the door is approached
// afresh or tapped. `pending` is a visitor waiting to go through: `walk` while they stand in the
// doorway, `tap` until they tap again.
type DoorState = {
    load: 'idle' | 'loading' | 'ready' | 'failed';
    progress: number;
    pending: 'walk' | 'tap' | null;
};

// The one background room. `instance` is set once `promise` resolves while this is still the
// slot, and `ready` once its parked level is resident.
type Parked<R> = { id: string; promise: Promise<R>; instance?: R; ready: boolean; abort: AbortController };

type Pending = { door: number; by: 'walk' | 'tap' };

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

class RoomManager<R> {
    onChange: ((room: RoomDef) => void) | null = null;

    private rooms: Map<string, RoomDef>;

    private host: RoomHost<R>;

    private room: RoomDef;

    private instance: R;

    private armed: boolean[];

    private parked: Parked<R> | null = null;

    private pending: Pending | null = null;

    // rooms whose load failed; retried when their door's radius is entered afresh, or on a tap
    private failed = new Set<string>();

    // the rooms within a door's radius on the last frame, for noticing a fresh approach
    private lastNear: string[] = [];

    private started = false;

    // the current room has had a frame with nothing left to stream since it was entered: only
    // then does background preloading start, so the room sharpens before the next one loads
    private settled = false;

    private entering = false;

    private destroyed = false;

    // whether an immersive session is on: doors pause in XR, taps included
    private xrActive: () => boolean;

    constructor(rooms: RoomDef[], first: R, host: RoomHost<R>, xrActive: () => boolean = () => false) {
        this.rooms = new Map(rooms.map((room) => [room.id, room]));
        this.host = host;
        this.room = rooms[0];
        this.instance = first;
        this.armed = this.room.doors.map(() => false);
        this.xrActive = xrActive;
    }

    get current(): RoomDef {
        return this.room;
    }

    get busy(): boolean {
        return this.entering;
    }

    // Allows preloading; called once the first room has revealed.
    start() {
        this.started = true;
    }

    // What the door's marker shows, for the current room's door at `index`.
    doorState(index: number): DoorState {
        const door = this.room.doors[index];
        const id = door?.to;
        const pending = this.pending?.door === index ? this.pending.by : null;
        if (id === undefined) return { load: 'idle', progress: 0, pending };

        const parked = this.parked;
        if (parked?.id === id) {
            if (parked.ready) return { load: 'ready', progress: 1, pending };
            let progress = 0;
            if (parked.instance !== undefined) {
                try {
                    progress = Math.max(0, Math.min(1, this.host.progress(parked.instance)));
                } catch {
                    // reported as no progress rather than breaking the marker
                }
            }
            return { load: 'loading', progress, pending };
        }
        return { load: this.failed.has(id) ? 'failed' : 'idle', progress: 0, pending };
    }

    // Per frame: cancels or completes a walk-in, goes through a door the camera walked into, and
    // keeps the room behind the nearest door preloading. `p` carries the camera's view angles
    // when known, so a walk-in arrives looking the way it went in. `quiet` is a frame on which
    // the current room had nothing left to stream.
    update(p: Point, mode: CameraMode, xrActive: boolean, quiet = false) {
        if (!this.started || this.entering || this.destroyed) return;
        if (quiet) this.settled = true;

        const decision = evaluateDoors(this.room.doors, p, mode, xrActive, this.armed);
        this.armed = decision.armed;

        // a door approached afresh gets its failed room another try
        for (const id of decision.preload) {
            if (!this.lastNear.includes(id)) this.failed.delete(id);
        }
        this.lastNear = decision.preload;

        const pending = this.pending;
        if (pending) {
            const door = this.room.doors[pending.door];
            if (pending.by === 'walk' && !(insideDoor(door, p) && canEnterByPosition(mode, xrActive))) {
                // stepped out, or can no longer go through by position: the walk-in is off, and
                // the door must be left before it triggers again
                this.pending = null;
                this.armed[pending.door] = false;
            } else if (this.parked?.id === door.to && this.parked.ready) {
                this.pending = null;
                this.go(pending.door, pending.by === 'walk' ? arrivalThrough(door, p, door.arrival) : door.arrival);
                return;
            }
        } else if (decision.enter !== null) {
            this.request(decision.enter, 'walk', p);
            return;
        }

        // Background preloading: the room behind a door within its radius, else behind the
        // nearest door. A parked room is kept until another door's radius is entered, so walking
        // about between doors does not keep replacing it. A pending request owns the slot.
        if (!this.settled || this.pending) return;
        const parked = this.parked;
        if (parked && (decision.preload.length === 0 || decision.preload.includes(parked.id))) return;
        const id =
            decision.preload.find((candidate) => !this.failed.has(candidate)) ??
            (decision.nearest !== null && !this.failed.has(decision.nearest) ? decision.nearest : undefined);
        if (id !== undefined && id !== parked?.id) this.park(id);
    }

    // A tap on a door's marker: goes through at once when the room is ready, else loads it and
    // goes through once it is; a second tap meanwhile cancels. Ignored while a transition runs.
    // The host's failures are reported through host.warn and never thrown.
    async enter(doorIndex: number): Promise<void> {
        const door = this.room.doors[doorIndex];
        if (this.entering || this.destroyed || this.xrActive() || !door || !this.rooms.has(door.to)) return;

        if (this.pending?.door === doorIndex && this.pending.by === 'tap') {
            this.pending = null;
            return;
        }
        await this.request(doorIndex, 'tap');
    }

    // Releases the parked room and stops any transition or preload in flight.
    destroy() {
        this.destroyed = true;
        this.pending = null;
        const parked = this.parked;
        this.parked = null;
        parked?.abort.abort();
        if (parked?.instance !== undefined) this.host.release(parked.instance);
    }

    // Goes through the door now if its room is ready, else parks the room (retrying a failed
    // one) and leaves the request pending for `update`. A walk-in (with the camera at `p`)
    // arrives looking the way it went in; a tap arrives at the configured pose.
    private request(doorIndex: number, by: 'walk' | 'tap', p?: Point): Promise<void> {
        const door = this.room.doors[doorIndex];
        const id = door.to;
        if (by === 'walk' && this.failed.has(id)) return Promise.resolve();
        this.failed.delete(id);
        const parked = this.parked?.id === id ? this.parked : this.park(id);
        if (parked.ready) {
            this.pending = null;
            return this.go(doorIndex, p ? arrivalThrough(door, p, door.arrival) : door.arrival);
        }
        this.pending = { door: doorIndex, by };
        return Promise.resolve();
    }

    // Runs the transition through a door whose room is parked and ready. Whatever the host
    // throws, the screen is faded back in and the manager is no longer busy afterwards.
    private async go(doorIndex: number, arrival: ArrivalPose): Promise<void> {
        const door = this.room.doors[doorIndex];
        const destination = this.rooms.get(door.to) as RoomDef;
        this.entering = true;
        const from = this.room;
        try {
            await this.transition(destination, arrival);
        } catch (err) {
            // the host threw while fading or swapping the rooms
            if (!this.destroyed) {
                // still in the old room: the walk-in must leave the door before it retries
                if (this.room === from) this.armed[doorIndex] = false;
                await this.fadeIn();
                this.host.warn(`rooms: moving to room "${destination.id}" failed: ${describeError(err)}`);
            }
        } finally {
            this.entering = false;
        }
    }

    // Spec "Transition sequence": fade out, swap, fade in. The room is parked and ready by now.
    private async transition(destination: RoomDef, arrival: ArrivalPose): Promise<void> {
        const host = this.host;
        const parked = this.parked;
        if (parked?.id !== destination.id || !parked.ready || parked.instance === undefined) {
            throw new Error(`room "${destination.id}" is not ready`);
        }
        const { instance } = parked;

        await host.fade(true);
        if (this.destroyed) return;

        // if activate throws, the room stays parked (released on destroy or replaced later)
        host.activate(instance, destination, arrival);
        this.parked = null;

        const previous = this.instance;
        this.room = destination;
        this.instance = instance;
        this.armed = destination.doors.map(() => false);
        this.failed.clear();
        this.lastNear = [];
        this.settled = false;
        try {
            host.release(previous);
        } finally {
            this.onChange?.(destination);
        }

        await this.fadeIn();
    }

    // Best-effort fade back in: a failing fade is reported, never left to keep the manager busy.
    private async fadeIn(): Promise<void> {
        try {
            await this.host.fade(false);
        } catch (err) {
            this.host.warn(`rooms: could not fade in: ${describeError(err)}`);
        }
    }

    // Starts loading a room into the slot, releasing whatever was parked there, and watches for
    // its parked level to become resident.
    private park(id: string): Parked<R> {
        const previous = this.parked;
        // a load still in flight stops downloading, so it does not compete with the new one
        previous?.abort.abort();
        if (previous?.instance !== undefined) this.host.release(previous.instance);

        const room = this.rooms.get(id) as RoomDef;
        const abort = new AbortController();
        const parked: Parked<R> = { id, promise: this.host.load(room, abort.signal), ready: false, abort };
        this.parked = parked;

        const fail = (err: unknown) => {
            if (this.parked !== parked) return;
            this.parked = null;
            this.failed.add(id);
            if (parked.instance !== undefined) this.host.release(parked.instance);
            if (this.pending && this.room.doors[this.pending.door]?.to === id) this.pending = null;
            this.host.warn(`rooms: could not preload room "${id}": ${describeError(err)}`);
        };

        parked.promise.then((instance) => {
            if (this.parked !== parked) {
                // replaced or destroyed while loading
                this.host.release(instance);
                return;
            }
            parked.instance = instance;
            this.host.whenReady(instance).then(() => {
                if (this.parked === parked) parked.ready = true;
            }, fail);
        }, fail);

        return parked;
    }
}

export { RoomManager };
export type { DoorState, RoomHost };
