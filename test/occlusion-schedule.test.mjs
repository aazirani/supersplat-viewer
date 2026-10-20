import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

// Imported from source rather than the build: the class is internal to the bundle. Node strips
// the types itself.
import { OcclusionSchedule } from '../src/ui/occlusion-schedule.ts';

const SETTLE_MS = 150;
const MOVING_MS = 1000;

// one frame of a camera that moved, 16ms apart
const frames = (schedule, count, keepsMoving) => {
    for (let i = 0; i < count; i++) {
        schedule.moved(keepsMoving);
        mock.timers.tick(16);
    }
};

describe('OcclusionSchedule', () => {
    let runs;
    let schedule;

    beforeEach(() => {
        mock.timers.enable({ apis: ['setTimeout', 'Date'] });
        runs = [];
        schedule = new OcclusionSchedule((moving) => runs.push(moving), SETTLE_MS, MOVING_MS);
    });

    afterEach(() => {
        schedule.cancel();
        mock.timers.reset();
    });

    it('tests once the camera has been still a moment', () => {
        frames(schedule, 10, false);
        assert.deepEqual(runs, []);
        mock.timers.tick(SETTLE_MS);
        assert.deepEqual(runs, [false]);
    });

    it('does not test a user move until it stops', () => {
        // ten seconds of a visitor moving: hotspots keep their state until the camera rests
        frames(schedule, 625, false);
        assert.deepEqual(runs, []);
    });

    it('tests a camera animation as it plays, since it never rests', () => {
        // the idle tour plays on until the visitor takes over: without these the hotspots stay
        // in their first, dimmed, state for as long as it plays
        frames(schedule, 188, true);
        assert.deepEqual(runs, [true, true, true]);
    });

    it('still tests once an animation stops', () => {
        frames(schedule, 10, true);
        mock.timers.tick(SETTLE_MS);
        assert.deepEqual(runs, [true, false]);
    });

    it('tests on request once settled, as when the hotspots come back into view', () => {
        schedule.settle();
        mock.timers.tick(SETTLE_MS);
        assert.deepEqual(runs, [false]);
    });

    it('runs nothing once cancelled', () => {
        frames(schedule, 3, false);
        schedule.cancel();
        mock.timers.tick(SETTLE_MS * 2);
        assert.deepEqual(runs, []);
    });
});
