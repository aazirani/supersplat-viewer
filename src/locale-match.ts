/**
 * The first of `candidates` the viewer offers a translation for, in order, so the earlier ones
 * win: the link's `?lang=`, then the site's own language, then the browser's. Missing and
 * unoffered candidates are passed over.
 *
 * @param candidates - Language tags in order of preference, such as `fa`, `pt-br` or `fr-CA`.
 * @param available - The offered locales' keys, such as `en` and `pt-BR`.
 * @returns The matching key, or `en` when none matches.
 */
const matchLocale = (candidates: readonly (string | null | undefined)[], available: readonly string[]): string => {
    for (const c of candidates) {
        if (!c) continue;
        const lc = c.toLowerCase();
        const base = lc.split('-')[0];
        // 1. exact tag match (case-insensitive: "DE" → "de", "pt-br" → "pt-BR")
        // 2. base-language match ("fr-CA" → "fr")
        // 3. any region variant sharing the base ("pt" → "pt-BR", "zh" → "zh-CN")
        const match =
            available.find((k) => k.toLowerCase() === lc) ??
            available.find((k) => k.toLowerCase() === base) ??
            available.find((k) => k.toLowerCase().split('-')[0] === base);
        if (match) return match;
    }
    return 'en';
};

export { matchLocale };
