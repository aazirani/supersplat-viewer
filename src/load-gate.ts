// What a gsplat load does with each of its asset's events once it may no longer be wanted: the
// engine does not abort a download, so a cancelled load's asset still fires progress, load or
// error, and only the first outcome may act. Pure, so Node can run it in tests.

type LoadGate = {
    /** A progress event: keep going, cancel now, or ignore (already settled). */
    progress(): 'continue' | 'cancel' | 'ignore';
    /** The load event: resolve, cancel (no longer wanted), or ignore (already settled). */
    load(): 'resolve' | 'cancel' | 'ignore';
    /** The error event: reject, or ignore (already settled). */
    error(): 'reject' | 'ignore';
};

/**
 * @param cancelled - Whether the load is no longer wanted (the viewer destroyed, or a room
 * preload replaced).
 */
const createLoadGate = (cancelled: () => boolean): LoadGate => {
    let settled = false;
    return {
        progress() {
            if (settled) return 'ignore';
            if (!cancelled()) return 'continue';
            settled = true;
            return 'cancel';
        },
        load() {
            if (settled) return 'ignore';
            settled = true;
            return cancelled() ? 'cancel' : 'resolve';
        },
        error() {
            if (settled) return 'ignore';
            settled = true;
            return 'reject';
        }
    };
};

export { createLoadGate };
export type { LoadGate };
