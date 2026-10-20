// The black layer a room change fades through. Styled in index.scss (`.sse-roomFade`).

// Matches the css transition in index.scss.
const FADE_MS = 200;

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const createFadeOverlay = (root: HTMLElement) => {
    const element = document.createElement('div');
    element.className = 'sse-roomFade';
    root.appendChild(element);

    // fades in flight, settled on destroy so nothing waits on a removed overlay
    const pending = new Map<ReturnType<typeof setTimeout>, () => void>();

    return {
        // Resolves once the fade has run, on a timer rather than `transitionend`, so it also
        // resolves when the viewer is hidden or the opacity did not change.
        fade(opaque: boolean): Promise<void> {
            const instant = reducedMotion();
            element.classList.toggle('sse-instant', instant);
            element.classList.toggle('sse-opaque', opaque);
            return new Promise<void>((resolve) => {
                const timer = setTimeout(
                    () => {
                        pending.delete(timer);
                        resolve();
                    },
                    instant ? 0 : FADE_MS
                );
                pending.set(timer, resolve);
            });
        },

        destroy() {
            for (const [timer, resolve] of pending) {
                clearTimeout(timer);
                resolve();
            }
            pending.clear();
            element.remove();
        }
    };
};

type FadeOverlay = ReturnType<typeof createFadeOverlay>;

export { FADE_MS, createFadeOverlay };
export type { FadeOverlay };
