// A rectangle from four picked points: what the debug panel's screen picker writes into the
// settings. Pure, so Node can run it in tests.

import type { Vec3T } from './videos-settings';

/** A rectangle in space, its corners in the settings' order: top-left, top-right, bottom-right, bottom-left. */
type Rect = { corners: [Vec3T, Vec3T, Vec3T, Vec3T]; center: Vec3T; width: number; height: number };

// a rectangle narrower or shorter than this is not a screen
const MIN_EXTENT = 0.001;

const add = (a: Vec3T, b: Vec3T): Vec3T => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3T, b: Vec3T): Vec3T => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3T, s: number): Vec3T => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3T, b: Vec3T) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3T, b: Vec3T): Vec3T => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
];
const length = (a: Vec3T) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3T): Vec3T | null => {
    const len = length(a);
    return len < 1e-9 ? null : scale(a, 1 / len);
};
const midpoint = (a: Vec3T, b: Vec3T): Vec3T => scale(add(a, b), 0.5);

/**
 * Fit a true rectangle to four points picked at a screen's corners, in the order top-left,
 * top-right, bottom-right, bottom-left. The centre is their mean, the right axis runs from the
 * left edge's midpoint to the right edge's, the normal is the picked quadrilateral's (facing the
 * picker), and the width and height are the edges' mean projections. Null for fewer or more
 * than four points, or points that do not span a plane.
 */
const fitScreenCorners = (points: readonly Vec3T[]): Rect | null => {
    if (points.length !== 4) return null;
    const [tl, tr, br, bl] = points;

    const u = normalize(sub(midpoint(tr, br), midpoint(tl, bl)));
    const n = normalize(cross(sub(bl, tl), sub(tr, tl)));
    if (!u || !n) return null;
    // the down axis, orthogonal to both; `n × u` points down for a visitor-facing normal, which
    // the sign check makes sure of whatever the picks' handedness
    let v = cross(n, u);
    if (dot(v, sub(bl, tl)) < 0) v = scale(v, -1);

    const width = (dot(sub(tr, tl), u) + dot(sub(br, bl), u)) / 2;
    const height = (dot(sub(bl, tl), v) + dot(sub(br, tr), v)) / 2;
    if (width < MIN_EXTENT || height < MIN_EXTENT) return null;

    const center: Vec3T = [0, 1, 2].map((i) => (tl[i] + tr[i] + br[i] + bl[i]) / 4) as Vec3T;
    const halfU = scale(u, width / 2);
    const halfV = scale(v, height / 2);
    const corners: Rect['corners'] = [
        sub(sub(center, halfU), halfV),
        sub(add(center, halfU), halfV),
        add(add(center, halfU), halfV),
        add(sub(center, halfU), halfV)
    ];
    return { corners, center, width, height };
};

export { fitScreenCorners };
export type { Rect };
