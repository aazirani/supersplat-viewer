/**
 * How visible a hotspot is at a distance from the camera: fully up to `near`, not at all from
 * `far` on, and eased between, so the hotspots of a room's far side give way to the near ones
 * rather than crowding the view.
 *
 * @param distance - The hotspot's distance from the camera.
 * @param near - The distance up to which it shows fully.
 * @param far - The distance from which it is gone.
 * @returns The opacity factor, 1 to 0.
 */
const distanceFade = (distance: number, near: number, far: number) => {
    const t = Math.min(1, Math.max(0, (distance - near) / (far - near)));
    return 1 - t * t * (3 - 2 * t);
};

export { distanceFade };
