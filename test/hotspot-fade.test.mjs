import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build: the helper is internal to the bundle. Node strips
// the types itself.
import { distanceFade } from '../src/ui/hotspot-fade.ts';

describe('distanceFade', () => {
    it('is fully visible up to the near distance', () => {
        assert.equal(distanceFade(0, 2, 6), 1);
        assert.equal(distanceFade(2, 2, 6), 1);
    });

    it('is gone from the far distance on', () => {
        assert.equal(distanceFade(6, 2, 6), 0);
        assert.equal(distanceFade(50, 2, 6), 0);
    });

    it('is half way at the middle, easing at both ends', () => {
        assert.equal(distanceFade(4, 2, 6), 0.5);
        // eased: a quarter of the way in has faded less than a quarter
        assert.ok(distanceFade(3, 2, 6) > 0.75);
        assert.ok(distanceFade(5, 2, 6) < 0.25);
    });

    it('fades steadily with distance', () => {
        let last = 1;
        for (let d = 2; d <= 6; d += 0.25) {
            const fade = distanceFade(d, 2, 6);
            assert.ok(fade <= last);
            last = fade;
        }
    });
});
