import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build: the helper is internal to the bundle. Node strips
// the types itself.
import { matchLocale } from '../src/locale-match.ts';

const AVAILABLE = ['de', 'en', 'es', 'fa', 'fr', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN'];

// the order the viewer asks in: the link's ?lang=, the site's own language, then the browser's
const pick = (link, site, browser) => matchLocale([link, site, ...browser], AVAILABLE);

describe('matchLocale', () => {
    it("takes the site's language over the browser's", () => {
        assert.equal(pick(null, 'fa', ['en-US', 'en']), 'fa');
    });

    it("takes the link's language over the site's", () => {
        assert.equal(pick('en', 'fa', ['fa-IR']), 'en');
        assert.equal(pick('fa', 'en', ['en-US']), 'fa');
    });

    it("falls back to the site's language when the link names one not offered", () => {
        assert.equal(pick('xx', 'fa', ['en-US']), 'fa');
    });

    it('goes by the browser when neither the link nor the site sets one', () => {
        assert.equal(pick(null, undefined, ['fa-IR', 'en']), 'fa');
        assert.equal(pick(null, undefined, ['de-AT']), 'de');
    });

    it('matches regardless of case and region', () => {
        assert.equal(pick('FA', null, []), 'fa');
        assert.equal(pick('pt', null, []), 'pt-BR');
        assert.equal(pick('pt-br', null, []), 'pt-BR');
    });

    it('falls back to english when nothing matches', () => {
        assert.equal(pick(null, null, ['xx']), 'en');
        assert.equal(pick(null, null, []), 'en');
    });
});
