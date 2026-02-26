import type { ColdRestoreState } from "./types";

/**
 * Module-level map to track pending detach timeouts.
 * This survives React StrictMode's unmount/remount cycle, allowing us to
 * cancel a pending detach if the component immediately remounts.
 */
export const pendingDetaches = new Map<string, NodeJS.Timeout>();

/**
 * Module-level map to track cold restore state across StrictMode cycles.
 * When cold restore is detected, we store the state here so it survives
 * the unmount/remount that StrictMode causes. Without this, the first mount
 * detects cold restore and sets state, but StrictMode unmounts and remounts
 * with fresh state, losing the cold restore detection.
 */
export const coldRestoreState = new Map<string, ColdRestoreState>();

/**
 * Module-level map to track whether the user's terminal viewport was at the
 * bottom just before the component unmounted (e.g., on a tab switch). Used by
 * maybeApplyInitialState to decide whether to scroll to the bottom after
 * restoring — preserving the user's scroll position when they were reading
 * earlier output.
 */
export const scrollPositionState = new Map<string, { wasAtBottom: boolean }>();
