// The black layer a room change fades through, with a spinner for a destination that is still
// loading. Styled in index.scss (`.sse-roomFade`).

// Matches the css transition in index.scss.
const FADE_MS = 200;

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const createFadeOverlay = (root: HTMLElement) => {
    const element = document.createElement('div');
    element.className = 'sse-roomFade';
    const spinner = document.createElement('div');
    spinner.className = 'sse-roomFade-spinner';
    element.appendChild(spinner);
    root.appendChild(element);

    // spun here rather than by a css animation, whose @keyframes name would be global
    let spin: Animation | null = null;

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

        setWaiting(on: boolean) {
            element.classList.toggle('sse-waiting', on);
            if (on && !spin) {
                spin =
                    spinner.animate?.([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
                        duration: 800,
                        iterations: Infinity
                    }) ?? null;
            } else if (!on && spin) {
                spin.cancel();
                spin = null;
            }
        },

        destroy() {
            spin?.cancel();
            spin = null;
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
