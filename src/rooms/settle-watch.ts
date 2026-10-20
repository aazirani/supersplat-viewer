// Whether the current room has had its turn at the connection: the signal the room manager
// waits for before it preloads the next room, so a room sharpens before the next one's download
// competes with it. Pure, so Node can run it in tests.

// a quiet frame counts only after a frame has shown the room streaming, or after this long in
// the room (content with nothing more to stream never shows a streaming frame)
const QUIET_DELAY_MS = 1000;

// on a slow connection a room keeps streaming as the visitor looks around; after this long the
// next room's coarsest level, a bounded cost that a wait at the door would charge later anyway,
// loads regardless
const QUIET_CAP_MS = 15000;

type SettleWatch = {
    /** A rendered frame: whether the view was ready, and how many files were in flight for it. */
    frame(ready: boolean, loading: number, now: number): void;
    /** A new room was entered at `now`. */
    reset(now: number): void;
    /** Whether the room has settled: a quiet frame has been seen, or the cap has passed. */
    settled(now: number): boolean;
};

/**
 * Settled once a rendered frame has had nothing left to stream for the view, or once the room
 * has been streaming for a while. The frame that reveals a room reports nothing in flight while
 * its finer levels are not requested yet, so a quiet frame counts only after a frame has shown
 * the room streaming, or after a moment for content that has nothing more to stream.
 *
 * @param now - When the first room was entered.
 */
const createSettleWatch = (now: number): SettleWatch => {
    let quiet = false;
    let streamed = false;
    let since = now;
    return {
        frame(ready, loading, at) {
            if (loading > 0) streamed = true;
            quiet = ready && loading === 0 && (streamed || at - since >= QUIET_DELAY_MS);
        },
        reset(at) {
            quiet = false;
            streamed = false;
            since = at;
        },
        settled(at) {
            return quiet || at - since >= QUIET_CAP_MS;
        }
    };
};

export { QUIET_CAP_MS, QUIET_DELAY_MS, createSettleWatch };
export type { SettleWatch };
