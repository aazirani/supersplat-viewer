/**
 * The annotation to select once the scene has loaded, from the `annotation` flag.
 *
 * @param annotation - The annotation's number as its hotspot shows it, 1 for the first; from a
 * link's `?annotation=`, so possibly anything a mistyped link gives.
 * @param count - How many annotations the scene has.
 * @returns The annotation's zero-based index, or null when there is none by that number.
 */
const startAnnotationIndex = (annotation: number | undefined, count: number): number | null => {
    if (annotation === undefined || !Number.isInteger(annotation)) return null;
    return annotation >= 1 && annotation <= count ? annotation - 1 : null;
};

export { startAnnotationIndex };
