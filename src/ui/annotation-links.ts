/**
 * A run of annotation text: plain text, or a link that opens in the info panel.
 */
type AnnotationTextSegment = { type: 'text'; text: string } | { type: 'link'; text: string; url: string };

/**
 * Annotation text split into what the tooltip shows. `moreInfoUrl` is the first bare url in the
 * text, taken out of it and shown as the tooltip's "More info" button instead.
 */
type ParsedAnnotationText = {
    segments: AnnotationTextSegment[];
    moreInfoUrl: string | null;
};

// `[label](url)`, the url allowed one level of balanced parentheses (wikipedia's
// `Amphora_(vessel)`); or a bare http(s) url, ending at whitespace
const LINK = /\[([^\]\n]+)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)|https?:\/\/[^\s<>"]+/gi;

// sentence punctuation that may follow a bare url without being part of it
const TRAILING_PUNCTUATION = /[.,;:!?'"]$/;

const count = (text: string, char: string) => text.split(char).length - 1;

// A bare url ends at whitespace, so drop what the sentence around it put on its end: closing
// punctuation, and a closing parenthesis that opened before the url rather than inside it
const trimBareUrl = (url: string) => {
    for (;;) {
        if (TRAILING_PUNCTUATION.test(url)) {
            url = url.slice(0, -1);
        } else if (url.endsWith(')') && count(url, ')') > count(url, '(')) {
            url = url.slice(0, -1);
        } else {
            return url;
        }
    }
};

/**
 * Whether a url is safe to open: http or https, absolute or relative to the page. Rules out
 * `javascript:`, `data:` and the like, which annotation text, being user-authored, could carry.
 *
 * @param url - The url as written in the annotation.
 * @returns True for an http(s) or relative url.
 */
const isSafeUrl = (url: string) => {
    try {
        const { protocol } = new URL(url, 'https://base.invalid/');
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
};

/**
 * Find the links in annotation text. The first bare url becomes the "More info" button and
 * leaves the text, joining the text either side of it with a single space; later bare urls and
 * `[label](url)` links stay in the text as links. A `[label](url)` whose url is not http(s) or
 * relative stays as the text it was written as.
 *
 * @param text - The annotation's text.
 * @returns The text's segments, and the "More info" button's url or null.
 */
const parseAnnotationText = (text: string): ParsedAnnotationText => {
    const segments: AnnotationTextSegment[] = [];
    let moreInfoUrl: string | null = null;

    // set where the button's url left the text, so the text after it does not add a second
    // space to the one before it
    let joinAfterRemoved = false;

    const addText = (value: string) => {
        const last = segments[segments.length - 1];
        if (joinAfterRemoved && (!last || (last.type === 'text' && /\s$/.test(last.text)))) {
            value = value.trimStart();
        }
        joinAfterRemoved = false;
        if (!value) return;
        if (last?.type === 'text') {
            last.text += value;
        } else {
            segments.push({ type: 'text', text: value });
        }
    };

    const addLink = (label: string, url: string) => {
        joinAfterRemoved = false;
        segments.push({ type: 'link', text: label, url });
    };

    LINK.lastIndex = 0;
    let index = 0;
    let match: RegExpExecArray | null;
    while ((match = LINK.exec(text)) !== null) {
        addText(text.slice(index, match.index));

        const [whole, label, labelledUrl] = match;
        if (label !== undefined) {
            if (isSafeUrl(labelledUrl)) {
                addLink(label, labelledUrl);
            } else {
                addText(whole);
            }
            index = match.index + whole.length;
        } else {
            const url = trimBareUrl(whole);
            if (moreInfoUrl === null) {
                moreInfoUrl = url;
                joinAfterRemoved = true;
            } else {
                addLink(url.replace(/^https?:\/\//i, ''), url);
            }
            // what was trimmed off the url is text again
            index = match.index + url.length;
            LINK.lastIndex = index;
        }
    }
    addText(text.slice(index));

    // no space before the text starts or after it ends
    const first = segments[0];
    if (first?.type === 'text') first.text = first.text.trimStart();
    const last = segments[segments.length - 1];
    if (last?.type === 'text') last.text = last.text.trimEnd();

    return {
        segments: segments.filter((segment) => segment.type === 'link' || segment.text),
        moreInfoUrl
    };
};

// the first letter, and whether it is of a script written right to left
const FIRST_LETTER = /\p{L}/u;
const RTL_LETTER = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;

/**
 * The direction text is written in, by its first letter, as the browser decides for
 * `dir="auto"`: digits, punctuation and spaces do not count.
 *
 * @param text - The text.
 * @returns `rtl` for Persian, Arabic, Hebrew and the like; `ltr` otherwise, or with no letters.
 */
const textDirection = (text: string): 'rtl' | 'ltr' => {
    const letter = FIRST_LETTER.exec(text);
    return letter && RTL_LETTER.test(letter[0]) ? 'rtl' : 'ltr';
};

export type { AnnotationTextSegment, ParsedAnnotationText };
export { isSafeUrl, parseAnnotationText, textDirection };
