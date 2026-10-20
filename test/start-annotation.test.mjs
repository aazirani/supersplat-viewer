import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build: the helper is internal to the bundle. Node strips
// the types itself.
import { startAnnotationIndex } from '../src/start-annotation.ts';

describe('startAnnotationIndex', () => {
    it('turns the number a hotspot shows into its zero-based index', () => {
        assert.equal(startAnnotationIndex(1, 3), 0);
        assert.equal(startAnnotationIndex(3, 3), 2);
    });

    it('selects nothing when no annotation was asked for', () => {
        assert.equal(startAnnotationIndex(undefined, 3), null);
    });

    it('ignores a number with no annotation behind it', () => {
        assert.equal(startAnnotationIndex(0, 3), null);
        assert.equal(startAnnotationIndex(4, 3), null);
        assert.equal(startAnnotationIndex(-1, 3), null);
        assert.equal(startAnnotationIndex(1, 0), null);
    });

    it('ignores what is not a whole number, as a mistyped link gives', () => {
        // Number('abc') and Number('2.5') from `?annotation=abc` or `?annotation=2.5`
        assert.equal(startAnnotationIndex(Number.NaN, 3), null);
        assert.equal(startAnnotationIndex(2.5, 3), null);
        assert.equal(startAnnotationIndex(Number.POSITIVE_INFINITY, 3), null);
    });
});
