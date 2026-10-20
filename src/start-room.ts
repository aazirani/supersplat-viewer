// Which door to go through for a link into another room (`?room=`). Pure, so Node can run it
// in tests.

import type { RoomDef } from './rooms/rooms-settings';

/** The door of the first room to take, a warning for a room that cannot be reached, or null for no request. */
type StartRoom = { door: number } | { warning: string } | null;

/**
 * The first room's door to go through to start in `room`.
 *
 * @param room - The room asked for; from a link's `?room=`, so possibly anything.
 * @param first - The first room, whose doors are the ways out of it.
 * @param ids - Every room's id.
 * @returns Null when no room is asked for or it is the first room; the index of the first
 * room's door to it; or a warning when the room is unknown or no door of the first room leads
 * there.
 */
const startRoomDoor = (room: string | undefined, first: RoomDef, ids: readonly string[]): StartRoom => {
    if (!room || room === first.id) return null;
    if (!ids.includes(room)) return { warning: `start room "${room}" is unknown` };
    const door = first.doors.findIndex((candidate) => candidate.to === room);
    if (door < 0) return { warning: `no door of room "${first.id}" leads to start room "${room}"` };
    return { door };
};

export { startRoomDoor };
export type { StartRoom };
