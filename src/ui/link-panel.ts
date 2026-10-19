import type { Localize } from '../localization';
import type { ViewerHandle } from '../types';

import { isSafeUrl } from './annotation-links';

// how long the panel takes to slide out (index.scss), after which its page is unloaded
const CLOSE_MS = 300;

// narrower than this, the viewer shows the panel as a sheet from the bottom
const NARROW_WIDTH = 600;

/** Opens a link's page in the panel, titled `title`. */
type OpenLink = (url: string, title: string) => void;

/** The panel, as the annotations use it. */
type LinkPanel = {
    open: OpenLink;
    close: () => void;
    isOpen: () => boolean;
    /** How much of the viewer's width, from its right edge, the open panel covers; 0 when closed. */
    coveredRight: () => number;
};

/**
 * The panel an annotation's links open in: the page in a frame, beside the scene on a wide
 * viewer and as a sheet from the bottom on a narrow one. Its header offers the page in a new
 * tab, for sites that refuse to be framed.
 *
 * Closes with its button or Escape. The annotations change its page, or close it, as the
 * selection changes.
 *
 * @param viewer - The viewer, to redraw the annotations around the panel.
 * @param root - The viewer's root element.
 * @param localize - Looks up the buttons' labels.
 * @returns The panel, and `dispose`, which removes the listeners added outside the panel.
 */
const initLinkPanel = (viewer: Pick<ViewerHandle, 'app'>, root: HTMLElement, localize: Localize) => {
    const panel = root.querySelector<HTMLElement>('.sse-linkPanel');
    const title = root.querySelector<HTMLElement>('.sse-linkPanelTitle');
    const openInTab = root.querySelector<HTMLAnchorElement>('.sse-linkPanelOpen');
    const close = root.querySelector<HTMLButtonElement>('.sse-linkPanelClose');
    const body = root.querySelector<HTMLElement>('.sse-linkPanelBody');
    const spinner = root.querySelector<HTMLElement>('.sse-linkPanelSpinner');

    // spun here rather than by a css animation, whose @keyframes name would be global; it runs
    // only while shown
    spinner.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
        duration: 800,
        iterations: Infinity
    });

    // the viewer's width, not the window's: it may be embedded in a smaller box
    const resizeObserver = new ResizeObserver(() => {
        panel.classList.toggle('sse-narrow', root.clientWidth < NARROW_WIDTH);
        redraw();
    });
    resizeObserver.observe(root);

    for (const [button, key] of [
        [openInTab, 'link-panel.open-in-new-tab'],
        [close, 'link-panel.close']
    ] as const) {
        button.title = localize(key);
        button.setAttribute('aria-label', localize(key));
    }

    // Kept from the scene beneath: a press here is not a camera drag, a click does not deselect
    // the annotation, and the wheel does not zoom
    for (const type of ['pointerdown', 'click', 'wheel']) {
        panel.addEventListener(type, (event) => event.stopPropagation());
    }

    let frame: HTMLIFrameElement | null = null;
    // the url the frame was opened at, which its own navigation does not change
    let frameUrl: string | null = null;
    let unloadTimer: ReturnType<typeof setTimeout> | null = null;

    const isOpen = () => panel.classList.contains('sse-open');

    // the open panel's left edge as it ends up, its slide aside (offsetLeft ignores transforms).
    // A sheet from the bottom covers no width: the tooltip stays above it
    const coveredRight = () => {
        if (!isOpen() || panel.classList.contains('sse-narrow')) return 0;
        return Math.max(0, root.clientWidth - panel.offsetLeft);
    };

    // the tooltip moves aside for the panel, or back, in the next frame, which a still camera
    // would not otherwise draw
    // and the annotation bar centres itself on what the panel leaves of the viewer, so its
    // buttons, which step through the exhibits with the panel open, stay in reach
    const redraw = () => {
        viewer.app.renderNextFrame = true;
        root.style.setProperty('--sse-link-panel-cover', `${coveredRight()}px`);
    };

    const unload = () => {
        unloadTimer = null;
        frame?.remove();
        frame = null;
        frameUrl = null;
    };

    const open: OpenLink = (url, text) => {
        if (!isSafeUrl(url)) return;

        // two exhibits sharing a page: the page stays, scrolled where the visitor left it
        if (isOpen() && frameUrl === url) {
            title.textContent = text;
            frame.title = text;
            return;
        }

        if (unloadTimer) clearTimeout(unloadTimer);
        unload();

        title.textContent = text;
        openInTab.href = url;

        // A fresh frame per page, so its history never reaches the viewer's. Sandboxed without
        // top navigation, so the page cannot navigate the viewer away; its links open in tabs
        frame = document.createElement('iframe');
        frame.className = 'sse-linkPanelFrame';
        frame.title = text;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.setAttribute(
            'sandbox',
            'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox'
        );
        frame.setAttribute('allow', 'fullscreen');
        panel.classList.add('sse-loading');
        frame.addEventListener('load', () => panel.classList.remove('sse-loading'));
        frame.src = url;
        frameUrl = url;
        body.appendChild(frame);

        panel.classList.add('sse-open');
        panel.setAttribute('aria-hidden', 'false');
        redraw();
    };

    const hide = () => {
        if (!isOpen()) return;
        panel.classList.remove('sse-open', 'sse-loading');
        panel.setAttribute('aria-hidden', 'true');
        // focus left on a button that slides out of view would have the browser scroll the
        // viewer after it
        if (panel.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
        redraw();
        // the page slides out with the panel, then goes, so a video on it stops
        unloadTimer = setTimeout(unload, CLOSE_MS);
    };

    close.addEventListener('click', hide);

    // Escape closes the panel before the viewer's own Escape (leaving a mode, say) sees it.
    // Only while focus is in the viewer: a page in the frame keeps its own keys
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && isOpen()) {
            event.stopImmediatePropagation();
            hide();
        }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });

    const dispose = () => {
        window.removeEventListener('keydown', onKeyDown, { capture: true });
        resizeObserver.disconnect();
        if (unloadTimer) clearTimeout(unloadTimer);
        unload();
    };

    const linkPanel: LinkPanel = { open, close: hide, isOpen, coveredRight };
    return { linkPanel, dispose };
};

export type { LinkPanel, OpenLink };
export { initLinkPanel };
