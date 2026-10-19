// Decides when a parked room's level is ready, or has stopped loading. Pure and dependency free
// so Node can run it in tests; the room host feeds it the resident file count.

// How long a wait may go without another file of the level arriving before it gives up.
const READY_STALL_TIMEOUT_MS = 30000;

type ReadyState = 'ready' | 'waiting' | 'stalled';

// `total` files make the level. Each call passes how many are resident now and the time; the
// deadline restarts whenever that count passes its highest so far, and while `paused` (a hidden page streams
// nothing, which is not a stall).
const createReadyWatch = (total: number, start: number, timeoutMs = READY_STALL_TIMEOUT_MS) => {
    let best = 0;
    let since = start;

    return (resident: number, now: number, paused = false): ReadyState => {
        if (resident >= total) return 'ready';
        if (resident > best || paused) {
            best = Math.max(best, resident);
            since = now;
        }
        return now - since >= timeoutMs ? 'stalled' : 'waiting';
    };
};

export { READY_STALL_TIMEOUT_MS, createReadyWatch };
export type { ReadyState };
