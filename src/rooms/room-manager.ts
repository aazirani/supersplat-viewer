// Runs the rooms at runtime: keeps at most one destination room parked in the background and swaps
// rooms behind a fade. Engine free (the host does the loading, fading and scene work) so Node can
// run it in tests.

import type { CameraMode } from '../types.ts';

import { evaluateDoors } from './door-trigger.ts';
import type { Point } from './door-trigger.ts';
import type { ArrivalPose, RoomDef } from './rooms-settings.ts';

// How long the screen may stay black waiting for a room before the spinner shows.
const FADE_WAIT_SPINNER_MS = 300;

type RoomHost<R> = {
    // creates the room parked and hidden
    load(room: RoomDef): Promise<R>;
    // resolves when the parked level is resident
    whenReady(instance: R): Promise<void>;
    // unpark + viewer.setRoom
    activate(instance: R, room: RoomDef, arrival: ArrivalPose): void;
    // destroy entity + unload asset
    release(instance: R): void;
    fade(opaque: boolean): Promise<void>;
    setWaiting(on: boolean): void;
    warn(message: string): void;
};

// The one background room. `instance` is set once `promise` resolves while this is still the slot.
type Parked<R> = { id: string; promise: Promise<R>; instance?: R };

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

class RoomManager<R> {
    onChange: ((room: RoomDef) => void) | null = null;

    private rooms: Map<string, RoomDef>;

    private host: RoomHost<R>;

    private room: RoomDef;

    private instance: R;

    private armed: boolean[];

    private parked: Parked<R> | null = null;

    // rooms whose background preload failed; retried once they leave the preload list
    private failed = new Set<string>();

    private started = false;

    private entering = false;

    private destroyed = false;

    private spinnerTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(rooms: RoomDef[], first: R, host: RoomHost<R>) {
        this.rooms = new Map(rooms.map((room) => [room.id, room]));
        this.host = host;
        this.room = rooms[0];
        this.instance = first;
        this.armed = this.room.doors.map(() => false);
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

    // Per frame: starts preloads near doors and goes through a door the camera walked into.
    update(p: Point, mode: CameraMode, xrActive: boolean) {
        if (!this.started || this.entering || this.destroyed) return;

        const decision = evaluateDoors(this.room.doors, p, mode, xrActive, this.armed);
        this.armed = decision.armed;

        for (const id of this.failed) {
            if (!decision.preload.includes(id)) this.failed.delete(id);
        }

        if (!this.parked || !decision.preload.includes(this.parked.id)) {
            const id = decision.preload.find((candidate) => !this.failed.has(candidate));
            if (id !== undefined) this.park(id);
        }

        if (decision.enter !== null) {
            this.enter(decision.enter);
        }
    }

    // Goes through a door of the current room. Ignored while a transition runs.
    async enter(doorIndex: number): Promise<void> {
        const door = this.room.doors[doorIndex];
        const destination = door && this.rooms.get(door.to);
        if (this.entering || this.destroyed || !destination) return;

        this.entering = true;
        const host = this.host;

        const fadedOut = host.fade(true);
        const parked = this.parked?.id === destination.id ? this.parked : this.park(destination.id);

        let waiting = false;
        let instance: R | undefined;
        try {
            await fadedOut;
            if (this.destroyed) return;

            this.spinnerTimer = setTimeout(() => {
                this.spinnerTimer = null;
                waiting = true;
                host.setWaiting(true);
            }, FADE_WAIT_SPINNER_MS);

            instance = await parked.promise;
            if (this.destroyed) return;
            await host.whenReady(instance);
            if (this.destroyed) return;
        } catch (err) {
            if (this.destroyed) return;
            this.clearSpinner();
            host.setWaiting(false);
            if (this.parked === parked) {
                this.parked = null;
                if (instance !== undefined) host.release(instance);
            }
            // A walk-in must leave the door before it retries, or a broken room would loop.
            this.armed[doorIndex] = false;
            await host.fade(false);
            host.warn(`rooms: could not open room "${destination.id}": ${describeError(err)}`);
            this.entering = false;
            return;
        } finally {
            if (this.destroyed) this.clearSpinner();
        }

        this.clearSpinner();
        if (waiting) host.setWaiting(false);

        this.parked = null;
        const previous = this.instance;
        host.activate(instance, destination, door.arrival);
        host.release(previous);

        this.room = destination;
        this.instance = instance;
        this.armed = destination.doors.map(() => false);
        this.failed.clear();
        this.onChange?.(destination);

        await host.fade(false);
        this.entering = false;
    }

    // Releases the parked room and stops any transition or preload in flight.
    destroy() {
        this.destroyed = true;
        this.clearSpinner();
        const parked = this.parked;
        this.parked = null;
        if (parked?.instance !== undefined) this.host.release(parked.instance);
    }

    // Starts loading a room into the slot, releasing whatever was parked there.
    private park(id: string): Parked<R> {
        const previous = this.parked;
        if (previous?.instance !== undefined) this.host.release(previous.instance);

        const room = this.rooms.get(id) as RoomDef;
        const parked: Parked<R> = { id, promise: this.host.load(room) };
        this.parked = parked;

        parked.promise.then(
            (instance) => {
                if (this.parked === parked) {
                    parked.instance = instance;
                } else {
                    // replaced or destroyed while loading
                    this.host.release(instance);
                }
            },
            (err: unknown) => {
                if (this.parked !== parked) return;
                this.parked = null;
                this.failed.add(id);
                // a transition waiting on this load reports the failure itself
                if (!this.entering) this.host.warn(`rooms: could not preload room "${id}": ${describeError(err)}`);
            }
        );

        return parked;
    }

    private clearSpinner() {
        if (this.spinnerTimer !== null) {
            clearTimeout(this.spinnerTimer);
            this.spinnerTimer = null;
        }
    }
}

export { FADE_WAIT_SPINNER_MS, RoomManager };
export type { RoomHost };
