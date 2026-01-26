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

export type ViewportState = {
	scrollTop: number;
	scrollHeight: number;
	clientHeight: number;
	wasAtBottom: boolean;
};

/**
 * Preserve viewport position across unmount/remount cycles.
 * This stabilizes reattach when the terminal redraws.
 */
export const viewportState = new Map<string, ViewportState>();
