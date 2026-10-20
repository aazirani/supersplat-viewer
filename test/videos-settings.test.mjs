import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build: Node strips the types itself.
import { DEFAULT_SOUND, readVideos, screenFrame } from '../src/video/videos-settings.ts';

// the museum's screen, corners as the spike measured them
const corners = () => [
    [-8.68685531791456, 0.2890500503027504, -0.4849025123716931],
    [-8.643695774475262, 0.27532838401552817, -1.2284644835276568],
    [-8.31626120227035, 0.025670085921443486, -1.1965002776003264],
    [-8.361253567277563, 0.041133627643091475, -0.466540483306945]
];

const valid = () => [
    {
        src: './sample.mp4',
        corners: corners(),
        offset: 0.015,
        sound: { fadeDistance: 10 }
    }
];

const only = (patch) => [{ ...valid()[0], ...patch }];

describe('readVideos', () => {
    it('returns no videos and no warnings when raw is undefined', () => {
        assert.deepEqual(readVideos(undefined), { videos: [], warnings: [] });
    });

    it('warns when videos is not an array', () => {
        const { videos, warnings } = readVideos({ src: 'x' });
        assert.deepEqual(videos, []);
        assert.equal(warnings.length, 1);
    });

    it('parses the spec example with defaults', () => {
        const { videos, warnings } = readVideos(valid());
        assert.deepEqual(warnings, []);
        assert.equal(videos.length, 1);
        const [video] = videos;
        assert.equal(video.src, './sample.mp4');
        assert.deepEqual(video.corners, corners());
        assert.equal(video.offset, 0.015);
        assert.equal(video.loop, true);
        assert.equal(video.playDistance, 20);
        assert.deepEqual(video.sound, { volume: 1, refDistance: 1, fadeDistance: 10 });
    });

    it('sound false means silent', () => {
        const { videos } = readVideos(only({ sound: false }));
        assert.equal(videos[0].sound, null);
    });

    it('sound omitted means the default sound', () => {
        const entry = valid()[0];
        delete entry.sound;
        const { videos } = readVideos([entry]);
        assert.deepEqual(videos[0].sound, DEFAULT_SOUND);
        assert.deepEqual(DEFAULT_SOUND, { volume: 1, refDistance: 1, fadeDistance: 12 });
    });

    it('keeps explicit loop, playDistance and offset', () => {
        const { videos } = readVideos(only({ loop: false, playDistance: 5, offset: 0 }));
        assert.equal(videos[0].loop, false);
        assert.equal(videos[0].playDistance, 5);
        assert.equal(videos[0].offset, 0);
    });

    const skipped = (name, patch) => {
        it(`skips ${name}`, () => {
            const { videos, warnings } = readVideos(only(patch));
            assert.deepEqual(videos, []);
            assert.equal(warnings.length, 1);
            assert.match(warnings[0], /videos\[0\]/);
        });
    };

    skipped('an entry without src', { src: undefined });
    skipped('an entry with an empty src', { src: '' });
    skipped('an entry with three corners', { corners: corners().slice(0, 3) });
    skipped('a corner with a non-finite number', { corners: [[NaN, 0, 0], ...corners().slice(1)] });
    skipped('a non-positive playDistance', { playDistance: 0 });
    skipped('a negative offset', { offset: -0.01 });
    skipped('a volume above 1', { sound: { volume: 1.5 } });
    skipped('a fadeDistance not above refDistance', { sound: { refDistance: 5, fadeDistance: 5 } });
    skipped('a sound that is neither false nor an object', { sound: 'loud' });

    it('skips an entry that is not an object', () => {
        const { videos, warnings } = readVideos(['x']);
        assert.deepEqual(videos, []);
        assert.match(warnings[0], /videos\[0\]/);
    });

    it('keeps the valid entries around an invalid one', () => {
        const { videos, warnings } = readVideos([valid()[0], { src: 'bad' }, valid()[0]]);
        assert.equal(videos.length, 2);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /videos\[1\]/);
    });

    it('copies the corners rather than keeping the raw arrays', () => {
        const raw = valid();
        const { videos } = readVideos(raw);
        raw[0].corners[0][0] = 99;
        assert.notEqual(videos[0].corners[0][0], 99);
    });
});

describe('screenFrame', () => {
    const near = (actual, expected, tolerance) => {
        for (let i = 0; i < expected.length; i++) {
            assert.ok(
                Math.abs(actual[i] - expected[i]) <= tolerance,
                `component ${i}: ${actual[i]} is not within ${tolerance} of ${expected[i]}`
            );
        }
    };

    it('faces the visitor', () => {
        const frame = screenFrame(corners());
        assert.ok(frame);
        // the normal the spike fitted to the screen
        near(frame.normal, [0.605, 0.796, 0.02], 0.05);
        const length = Math.hypot(...frame.normal);
        assert.ok(Math.abs(length - 1) < 1e-9, `normal is not unit length: ${length}`);
    });

    it('measures the screen', () => {
        const frame = screenFrame(corners());
        assert.ok(Math.abs(frame.width - 0.74) < 0.02, `width ${frame.width}`);
        assert.ok(Math.abs(frame.height - 0.41) < 0.02, `height ${frame.height}`);
        const mean = [0, 1, 2].map((i) => corners().reduce((s, p) => s + p[i], 0) / 4);
        near(frame.center, mean, 0.01);
    });

    it('rejects a degenerate rectangle', () => {
        const p = [1, 2, 3];
        assert.equal(screenFrame([p, p, p, p]), null);
    });
});
