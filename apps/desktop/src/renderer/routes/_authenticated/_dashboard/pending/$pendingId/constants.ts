/**
 * How long the pending workspace page waits for Electric to replicate a
 * just-created v2 workspace row to the renderer before swapping the spinner
 * for the "hasn't synced" recovery UI.
 *
 * Why 60s and not lower: Electric replication for a brand-new row can take
 * 10–20s on slower connections, and the warning copy ("Check your connection")
 * is alarming. Issue #3901 reported the previous 10s threshold firing on
 * every worktree create. The recovery UI is a stall fallback, not a
 * progress indicator — give sync plenty of room before invoking it.
 */
export const SYNC_TIMEOUT_MS = 60_000;
