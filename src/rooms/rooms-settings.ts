// Parsing of the optional `rooms` settings field. Pure and dependency free so Node can run it in
// tests; invalid entries are skipped with a warning instead of failing.

type Vec3T = [number, number, number];
type ArrivalPose = { position: Vec3T; target: Vec3T };
type DoorDef = {
    to: string;
    label: string;
    center: Vec3T;
    size: Vec3T;
    preloadRadius: number;
    arrival: ArrivalPose;
};
type RoomDef = { id: string; contentUrl?: string; settingsUrl?: string; doors: DoorDef[] };

const DEFAULT_PRELOAD_RADIUS = 8;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const isVec3 = (v: unknown): v is Vec3T =>
    Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

// Returns the door, or a string describing why it is invalid. `to` is checked separately.
const parseDoor = (raw: unknown): DoorDef | string => {
    if (!isObject(raw)) return 'must be an object';
    if (!isNonEmptyString(raw.to)) return 'needs a "to" room id';
    if (!isNonEmptyString(raw.label)) return 'needs a non-empty "label"';
    if (!isVec3(raw.center)) return '"center" must be three finite numbers';
    if (!isVec3(raw.size) || raw.size.some((n) => n <= 0)) return '"size" must be three positive numbers';

    const arrival = raw.arrival;
    if (!isObject(arrival) || !isVec3(arrival.position) || !isVec3(arrival.target)) {
        return '"arrival" needs "position" and "target" as three finite numbers';
    }

    const r = raw.preloadRadius;
    const preloadRadius = typeof r === 'number' && Number.isFinite(r) && r > 0 ? r : DEFAULT_PRELOAD_RADIUS;

    return {
        to: raw.to,
        label: raw.label,
        center: [...raw.center],
        size: [...raw.size],
        preloadRadius,
        arrival: { position: [...arrival.position], target: [...arrival.target] }
    };
};

const readRooms = (raw: unknown): { rooms: RoomDef[]; warnings: string[] } => {
    const warnings: string[] = [];
    if (raw === undefined) return { rooms: [], warnings };
    if (!Array.isArray(raw)) {
        warnings.push('rooms: must be an array');
        return { rooms: [], warnings };
    }

    // Pass 1: validate rooms and their doors' shape.
    const rooms: RoomDef[] = [];
    const ids = new Set<string>();
    // Where each kept door sits in the source arrays, for warning paths in pass 2.
    const origin = new Map<DoorDef, string>();
    for (let i = 0; i < raw.length; i++) {
        const path = `rooms[${i}]`;
        const entry: unknown = raw[i];
        const first = i === 0;

        const skip = (why: string) => {
            warnings.push(`${path}: ${why}`);
            return first;
        };

        if (!isObject(entry)) {
            if (skip('must be an object')) return { rooms: [], warnings };
            continue;
        }
        const label = isNonEmptyString(entry.id) ? `${path} "${entry.id}"` : path;
        if (!isNonEmptyString(entry.id)) {
            if (skip('needs a non-empty "id"')) return { rooms: [], warnings };
            continue;
        }
        if (ids.has(entry.id)) {
            warnings.push(`${label}: duplicate id, skipped`);
            continue;
        }
        if (!first && !isNonEmptyString(entry.contentUrl)) {
            warnings.push(`${label}: needs a "contentUrl", skipped`);
            continue;
        }
        if (entry.doors !== undefined && !Array.isArray(entry.doors)) {
            if (skip('"doors" must be an array')) return { rooms: [], warnings };
            continue;
        }

        const room: RoomDef = { id: entry.id, doors: [] };
        if (isNonEmptyString(entry.contentUrl)) room.contentUrl = entry.contentUrl;
        if (isNonEmptyString(entry.settingsUrl)) room.settingsUrl = entry.settingsUrl;
        ids.add(entry.id);
        rooms.push(room);

        const doors: unknown[] = (entry.doors as unknown[] | undefined) ?? [];
        doors.forEach((d, j) => {
            const door = parseDoor(d);
            if (typeof door === 'string') {
                warnings.push(`${path}.doors[${j}]: ${door}, skipped`);
            } else {
                room.doors.push(door);
                origin.set(door, `${path}.doors[${j}]`);
            }
        });
    }

    // Pass 2: drop doors to unknown rooms or back into their own room.
    for (const room of rooms) {
        room.doors = room.doors.filter((door) => {
            const at = origin.get(door);
            if (door.to === room.id) {
                warnings.push(`${at}: door to its own room "${door.to}", skipped`);
                return false;
            }
            if (!ids.has(door.to)) {
                warnings.push(`${at}: unknown room "${door.to}", skipped`);
                return false;
            }
            return true;
        });
    }

    return { rooms, warnings };
};

export { DEFAULT_PRELOAD_RADIUS, readRooms };
export type { Vec3T, ArrivalPose, DoorDef, RoomDef };
