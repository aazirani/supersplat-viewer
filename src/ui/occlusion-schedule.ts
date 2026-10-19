/**
 * When to test the hotspots against the scene. A test reads the scene back from the GPU, so it
 * runs once the camera has been still a moment rather than every frame, and a visitor's move
 * leaves the hotspots as they were until it ends. A camera animation never ends, though: the
 * idle tour plays until the visitor takes over, so it is tested as it goes as well, every
 * `movingMs`, and the hotspots keep up with it rather than wait in their first state.
 */
class OcclusionSchedule {
    private timer: ReturnType<typeof setTimeout> | null = null;

    private lastRun = -Infinity;

    private readonly run: (moving: boolean) => void;

    private readonly settleMs: number;

    private readonly movingMs: number;

    /**
     * @param run - Runs a test; `moving` when the camera is moving still, so the test may finish
     * after it has moved on.
     * @param settleMs - How long the camera must be still before a test.
     * @param movingMs - How often a camera that keeps moving is tested.
     */
    constructor(run: (moving: boolean) => void, settleMs: number, movingMs: number) {
        this.run = run;
        this.settleMs = settleMs;
        this.movingMs = movingMs;
    }

    /**
     * The camera moved this frame.
     *
     * @param keepsMoving - Whether it moves on by itself, as an animation does.
     */
    moved(keepsMoving: boolean) {
        this.settle();
        if (keepsMoving && Date.now() - this.lastRun >= this.movingMs) {
            this.start(true);
        }
    }

    /** Test once the camera has been still a moment, as after the scene changes under it. */
    settle() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = null;
            this.start(false);
        }, this.settleMs);
    }

    cancel() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    private start(moving: boolean) {
        this.lastRun = Date.now();
        this.run(moving);
    }
}

export { OcclusionSchedule };
