// Decides when a parked room's level is ready, or has stopped loading. Pure and dependency free
// so Node can run it in tests; the room host feeds it the level's progress in files.

// How long a wait may go without another file of the level arriving before it gives up.
const READY_STALL_TIMEOUT_MS = 30000;

type ReadyState = 'ready' | 'waiting' | 'stalled';

// `total` files make the level. Each call passes the progress in files (resident files, plus the
// downloaded part of the others, so a slow connection with bytes still flowing is not a stall)
// and the time; the deadline restarts whenever that progress passes its highest so far, and
// while `paused` (a hidden page streams nothing, which is not a stall).
const createReadyWatch = (total: number, start: number, timeoutMs = READY_STALL_TIMEOUT_MS) => {
    let best = 0;
    let since = start;

    return (progress: number, now: number, paused = false): ReadyState => {
        if (progress >= total) return 'ready';
        if (progress > best || paused) {
            best = Math.max(best, progress);
            since = now;
        }
        return now - since >= timeoutMs ? 'stalled' : 'waiting';
    };
};

export { READY_STALL_TIMEOUT_MS, createReadyWatch };
export type { ReadyState };
