// Parsing of the optional `videos` settings field: videos played on screens in the scan. Pure
// and dependency free so Node can run it in tests; invalid entries are skipped with a warning
// instead of failing, as the rooms are.

type Vec3T = [number, number, number];

/** How a screen's sound carries: full up to `refDistance`, then 1/d, silent from `fadeDistance`. */
type SoundDef = { volume: number; refDistance: number; fadeDistance: number };

/**
 * A video on a screen in the scan. `corners` are the picture's top-left, top-right, bottom-right
 * and bottom-left, as a visitor facing it sees them, in viewer world coordinates.
 */
type VideoDef = {
    src: string;
    corners: [Vec3T, Vec3T, Vec3T, Vec3T];
    offset: number;
    loop: boolean;
    playDistance: number;
    sound: SoundDef | null;
};

/** The screen's place in space, from its corners. */
type ScreenFrame = { center: Vec3T; normal: Vec3T; width: number; height: number };

const DEFAULT_SOUND: SoundDef = { volume: 1, refDistance: 1, fadeDistance: 12 };
const DEFAULT_OFFSET = 0.01;
const DEFAULT_PLAY_DISTANCE = 20;

// a screen narrower or shorter than this is not a screen
const MIN_EXTENT = 0.001;

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

const isVec3 = (v: unknown): v is Vec3T =>
    Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n));

const isFinite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Returns the sound, null for `false`, or a string describing why it is invalid.
const parseSound = (raw: unknown): SoundDef | null | string => {
    if (raw === false) return null;
    if (raw === undefined) return { ...DEFAULT_SOUND };
    if (!isObject(raw)) return '"sound" must be false or an object';
    const volume = raw.volume ?? DEFAULT_SOUND.volume;
    if (!isFinite(volume) || volume < 0 || volume > 1) return '"sound.volume" must be between 0 and 1';
    const refDistance = raw.refDistance ?? DEFAULT_SOUND.refDistance;
    if (!isFinite(refDistance) || refDistance <= 0) return '"sound.refDistance" must be positive';
    const fadeDistance = raw.fadeDistance ?? DEFAULT_SOUND.fadeDistance;
    if (!isFinite(fadeDistance) || fadeDistance <= refDistance) {
        return '"sound.fadeDistance" must be greater than "sound.refDistance"';
    }
    return { volume, refDistance, fadeDistance };
};

// Returns the video, or a string describing why it is invalid.
const parseVideo = (raw: unknown): VideoDef | string => {
    if (!isObject(raw)) return 'must be an object';
    if (typeof raw.src !== 'string' || raw.src.length === 0) return 'needs a non-empty "src"';
    const corners = raw.corners;
    if (!Array.isArray(corners) || corners.length !== 4 || !corners.every(isVec3)) {
        return '"corners" must be four points of three finite numbers';
    }
    const offset = raw.offset ?? DEFAULT_OFFSET;
    if (!isFinite(offset) || offset < 0) return '"offset" must be zero or positive';
    const loop = raw.loop ?? true;
    if (typeof loop !== 'boolean') return '"loop" must be true or false';
    const playDistance = raw.playDistance ?? DEFAULT_PLAY_DISTANCE;
    if (!isFinite(playDistance) || playDistance <= 0) return '"playDistance" must be positive';
    const sound = parseSound(raw.sound);
    if (typeof sound === 'string') return sound;

    return {
        src: raw.src,
        corners: corners.map(c => [...c] as Vec3T) as VideoDef['corners'],
        offset,
        loop,
        playDistance,
        sound
    };
};

const readVideos = (raw: unknown): { videos: VideoDef[]; warnings: string[] } => {
    const warnings: string[] = [];
    if (raw === undefined) return { videos: [], warnings };
    if (!Array.isArray(raw)) {
        warnings.push('videos: must be an array');
        return { videos: [], warnings };
    }
    const videos: VideoDef[] = [];
    raw.forEach((entry, i) => {
        const video = parseVideo(entry);
        if (typeof video === 'string') {
            warnings.push(`videos[${i}]: ${video}`);
        } else {
            videos.push(video);
        }
    });
    return { videos, warnings };
};

const sub = (a: Vec3T, b: Vec3T): Vec3T => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3T, b: Vec3T): Vec3T => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
];
const length = (a: Vec3T) => Math.hypot(a[0], a[1], a[2]);

/**
 * The screen's centre, the unit normal pointing at a visitor facing it, and its width and height
 * (the means of the opposite edges). Null for a degenerate rectangle.
 */
const screenFrame = (corners: VideoDef['corners']): ScreenFrame | null => {
    const [tl, tr, br, bl] = corners;
    const width = (length(sub(tr, tl)) + length(sub(br, bl))) / 2;
    const height = (length(sub(bl, tl)) + length(sub(br, tr))) / 2;
    if (width < MIN_EXTENT || height < MIN_EXTENT) return null;
    const n = cross(sub(bl, tl), sub(tr, tl));
    const len = length(n);
    if (len < MIN_EXTENT * MIN_EXTENT) return null;
    const normal: Vec3T = [n[0] / len, n[1] / len, n[2] / len];
    const center: Vec3T = [0, 1, 2].map(i => (tl[i] + tr[i] + br[i] + bl[i]) / 4) as Vec3T;
    return { center, normal, width, height };
};

export { DEFAULT_SOUND, readVideos, screenFrame };
export type { ScreenFrame, SoundDef, Vec3T, VideoDef };
