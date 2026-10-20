import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build: Node strips the types itself.
import { fitScreenCorners } from '../src/video/fit-screen.ts';

// a rectangle `w × h` in the xy plane (facing +z), rotated by Euler angles and moved
const rotate = ([x, y, z], [ax, ay, az]) => {
    const r = (deg) => (deg * Math.PI) / 180;
    let [px, py, pz] = [x, y, z];
    // x
    [py, pz] = [py * Math.cos(r(ax)) - pz * Math.sin(r(ax)), py * Math.sin(r(ax)) + pz * Math.cos(r(ax))];
    // y
    [px, pz] = [px * Math.cos(r(ay)) + pz * Math.sin(r(ay)), -px * Math.sin(r(ay)) + pz * Math.cos(r(ay))];
    // z
    [px, py] = [px * Math.cos(r(az)) - py * Math.sin(r(az)), px * Math.sin(r(az)) + py * Math.cos(r(az))];
    return [px, py, pz];
};

const rectangle = (w, h, angles, offset) =>
    [
        [-w / 2, h / 2, 0],
        [w / 2, h / 2, 0],
        [w / 2, -h / 2, 0],
        [-w / 2, -h / 2, 0]
    ].map((p) => rotate(p, angles).map((v, i) => v + offset[i]));

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const within = (a, b, tolerance) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

describe('fitScreenCorners', () => {
    const clean = rectangle(0.74, 0.41, [20, 50, 10], [-8.5, 0.15, -0.85]);
    // deterministic jitter of up to 4 mm on each coordinate
    const noise = [
        [0.004, -0.003, 0.002],
        [-0.002, 0.004, -0.004],
        [0.003, 0.001, 0.004],
        [-0.004, -0.002, -0.001]
    ];
    const picked = clean.map((p, i) => p.map((v, k) => v + noise[i][k]));

    it('returns a rectangle on a tilted plane', () => {
        const rect = fitScreenCorners(picked);
        assert.ok(rect);
        assert.ok(Math.abs(rect.width - 0.74) < 0.01, `width ${rect.width}`);
        assert.ok(Math.abs(rect.height - 0.41) < 0.01, `height ${rect.height}`);
        rect.corners.forEach((corner, i) => {
            assert.ok(within(corner, clean[i], 0.01), `corner ${i}: ${corner} vs ${clean[i]}`);
        });
        const mean = [0, 1, 2].map((i) => clean.reduce((s, p) => s + p[i], 0) / 4);
        assert.ok(within(rect.center, mean, 0.01));
    });

    it('returns coplanar corners that form a true rectangle', () => {
        const { corners } = fitScreenCorners(picked);
        const [tl, tr, br, bl] = corners;
        const triple = dot(cross(sub(tr, tl), sub(bl, tl)), sub(br, tl));
        assert.ok(Math.abs(triple) < 1e-6, `not coplanar: ${triple}`);
        // adjacent edges at right angles, opposite edges equal
        assert.ok(Math.abs(dot(sub(tr, tl), sub(bl, tl))) < 1e-9);
        assert.ok(within(sub(tr, tl), sub(br, bl), 1e-9));
    });

    it('rejects three points', () => {
        assert.equal(fitScreenCorners(picked.slice(0, 3)), null);
    });

    it('rejects collinear points', () => {
        const line = [0, 1, 2, 3].map((i) => [i, 2 * i, 0]);
        assert.equal(fitScreenCorners(line), null);
    });
});
