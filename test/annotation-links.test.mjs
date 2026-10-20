import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Imported from source rather than the build: the parser is internal to the bundle. Node strips
// the types itself.
import { isSafeUrl, parseAnnotationText, textDirection, trimBareUrl } from '../src/ui/annotation-links.ts';

describe('parseAnnotationText', () => {
    it('leaves text without links as one text segment', () => {
        assert.deepEqual(parseAnnotationText('Greek amphora, 5th century BC.'), {
            segments: [{ type: 'text', text: 'Greek amphora, 5th century BC.' }],
            moreInfoUrl: null
        });
    });

    it('returns no segments for empty text', () => {
        assert.deepEqual(parseAnnotationText(''), { segments: [], moreInfoUrl: null });
    });

    it('moves a bare url out of the text and into the more info button', () => {
        assert.deepEqual(parseAnnotationText('Greek amphora.\nhttps://museum.com/vase.html'), {
            segments: [{ type: 'text', text: 'Greek amphora.' }],
            moreInfoUrl: 'https://museum.com/vase.html'
        });
    });

    it('returns only the button when the text is just a url', () => {
        assert.deepEqual(parseAnnotationText('http://museum.com/vase'), {
            segments: [],
            moreInfoUrl: 'http://museum.com/vase'
        });
    });

    it('joins the text around a removed url with a single space', () => {
        assert.deepEqual(parseAnnotationText('Painted vase https://museum.com/v from Athens'), {
            segments: [{ type: 'text', text: 'Painted vase from Athens' }],
            moreInfoUrl: 'https://museum.com/v'
        });
    });

    it('keeps sentence punctuation out of a bare url', () => {
        assert.equal(
            parseAnnotationText('Read more at https://museum.com/vase.').moreInfoUrl,
            'https://museum.com/vase'
        );
        assert.equal(parseAnnotationText('(https://museum.com/vase)').moreInfoUrl, 'https://museum.com/vase');
    });

    it('keeps balanced parentheses inside a bare url', () => {
        assert.equal(
            parseAnnotationText('https://en.wikipedia.org/wiki/Amphora_(vessel)').moreInfoUrl,
            'https://en.wikipedia.org/wiki/Amphora_(vessel)'
        );
    });

    it('turns [label](url) into an inline link', () => {
        assert.deepEqual(parseAnnotationText('Painted by the [Berlin Painter](https://museum.com/bp).'), {
            segments: [
                { type: 'text', text: 'Painted by the ' },
                { type: 'link', text: 'Berlin Painter', url: 'https://museum.com/bp' },
                { type: 'text', text: '.' }
            ],
            moreInfoUrl: null
        });
    });

    it('accepts a relative path in [label](url)', () => {
        assert.deepEqual(parseAnnotationText('[The vase](exhibits/vase.html)').segments, [
            { type: 'link', text: 'The vase', url: 'exhibits/vase.html' }
        ]);
    });

    it('leaves [label](url) with an unsafe scheme as plain text', () => {
        for (const text of [
            '[click](javascript:alert(1))',
            '[click](data:text/html,hi)',
            '[click](JavaScript:void0)'
        ]) {
            assert.deepEqual(parseAnnotationText(text), {
                segments: [{ type: 'text', text }],
                moreInfoUrl: null
            });
        }
    });

    it('makes later bare urls inline links, shown without their scheme', () => {
        assert.deepEqual(parseAnnotationText('https://museum.com/a See also https://other.org/b'), {
            segments: [
                { type: 'text', text: 'See also ' },
                { type: 'link', text: 'other.org/b', url: 'https://other.org/b' }
            ],
            moreInfoUrl: 'https://museum.com/a'
        });
    });

    it('uses a bare url for the button alongside inline links', () => {
        assert.deepEqual(
            parseAnnotationText('By the [Berlin Painter](https://museum.com/bp). https://museum.com/vase'),
            {
                segments: [
                    { type: 'text', text: 'By the ' },
                    { type: 'link', text: 'Berlin Painter', url: 'https://museum.com/bp' },
                    { type: 'text', text: '.' }
                ],
                moreInfoUrl: 'https://museum.com/vase'
            }
        );
    });
});

describe('textDirection', () => {
    it('reads persian, arabic and hebrew right to left', () => {
        assert.equal(textDirection('موویولا مدل UD 20 CS'), 'rtl');
        assert.equal(textDirection('متحف السينما'), 'rtl');
        assert.equal(textDirection('מוזיאון'), 'rtl');
    });

    it('reads latin and other scripts left to right', () => {
        assert.equal(textDirection('Moviola UD 20 CS'), 'ltr');
        assert.equal(textDirection('Кинокамера'), 'ltr');
        assert.equal(textDirection('映画博物館'), 'ltr');
    });

    it('goes by the first letter, past digits, punctuation and spaces', () => {
        assert.equal(textDirection('20 CS موویولا'), 'ltr');
        assert.equal(textDirection('۱۴۰۵ - «موویولا» UD'), 'rtl');
    });

    it('reads text with no letters left to right', () => {
        assert.equal(textDirection(''), 'ltr');
        assert.equal(textDirection('3393 - 42'), 'ltr');
    });
});

describe('isSafeUrl', () => {
    // a scheme-relative url is as good as an absolute https one
    const safe = ['https://a/b', 'http://a/b', '/page', './page', 'page.html?x=1#y', '//other.example/'];
    const unsafe = ['javascript:alert(1)', 'java\tscript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', 'vbscript:x', 'blob:https://a/b', 'file:///etc/passwd'];
    for (const url of safe) {
        it(`accepts ${JSON.stringify(url)}`, () => assert.equal(isSafeUrl(url), true));
    }
    for (const url of unsafe) {
        it(`rejects ${JSON.stringify(url)}`, () => assert.equal(isSafeUrl(url), false));
    }
});

describe('trimBareUrl', () => {
    it('leaves a plain url alone', () => {
        assert.equal(trimBareUrl('https://a.example/item/3393'), 'https://a.example/item/3393');
    });
    it('drops sentence punctuation after the url', () => {
        assert.equal(trimBareUrl('https://a.example/x.'), 'https://a.example/x');
        assert.equal(trimBareUrl('https://a.example/x,'), 'https://a.example/x');
    });
    it('drops a closing bracket that was not opened in the url', () => {
        assert.equal(trimBareUrl('https://a.example/x)'), 'https://a.example/x');
        assert.equal(trimBareUrl('https://a.example/x]'), 'https://a.example/x');
    });
    it('keeps a closing bracket that the url opened', () => {
        assert.equal(trimBareUrl('https://a.example/wiki/Foo_(bar)'), 'https://a.example/wiki/Foo_(bar)');
    });
});
