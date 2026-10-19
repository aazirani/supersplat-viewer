import regular from './fonts/vazirmatn-arabic-400-normal.woff2';
import bold from './fonts/vazirmatn-arabic-700-normal.woff2';

// Vazirmatn (SIL Open Font License, src/fonts/Vazirmatn-OFL.txt) for Persian and Arabic text,
// carried in the bundle rather than fetched from a font service, which may be slow or blocked
// where the text is read. Under a family name of the viewer's own, so a host page's own
// Vazirmatn is left alone; index.scss puts it first in the font stack.
const FAMILY = 'sse-vazirmatn';

// Only these characters, the files' Arabic-script subset: Latin text keeps the stack's next font
const UNICODE_RANGE =
    'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, ' +
    'U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC';

let added = false;

/**
 * Add the Persian font to the document, once however many viewers it holds. Added from script
 * rather than an `@font-face` rule, which would sit outside the stylesheet's instance root.
 * The browser decodes a face only once text needs it.
 */
const addPersianFont = () => {
    if (added || typeof FontFace === 'undefined' || !document.fonts) return;
    added = true;
    for (const [source, weight] of [
        [regular, '400'],
        [bold, '700']
    ]) {
        // a set of faces; the dom lib this project builds with leaves out its set methods
        (document.fonts as unknown as Set<FontFace>).add(
            new FontFace(FAMILY, `url(${source}) format('woff2')`, {
                weight,
                style: 'normal',
                display: 'swap',
                unicodeRange: UNICODE_RANGE
            })
        );
    }
};

export { addPersianFont };
