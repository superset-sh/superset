/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode:
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/microsoft/vscode/blob/main/LICENSE.txt
 *--------------------------------------------------------------------------------------------*/

// Ported from VSCode:
//   src/vs/workbench/contrib/terminal/browser/terminalResizeDebouncer.ts
//
// Upstream depends on VSCode's Disposable / MutableDisposable lifecycle,
// getWindow + runWhenWindowIdle DOM utilities, and a `@debounce(100)` TS
// decorator. This port preserves the three-tier algorithm and upstream
// rationale comments, but uses native browser primitives so it stays
// self-contained. Upstream source is preserved in the JSDoc on each method
// for diffability against future VSCode revisions.

/**
 * The _normal_ buffer length threshold at which point resizing starts being debounced.
 *
 * Upstream (VSCode terminalResizeDebouncer.ts):
 *
 *   const enum Constants {
 *       StartDebouncingThreshold = 200,
 *   }
 */
export const StartDebouncingThreshold = 200;

/**
 * Debounce interval for horizontal (reflow-heavy) resizes. Matches upstream's
 * `@debounce(100)` decorator on `_debounceResizeX`.
 */
export const DebounceMs = 100;

export interface ResizeDebouncerCallbacks {
	/** Whether the host container is currently visible on screen. */
	isVisible: () => boolean;
	/**
	 * Length of xterm's _normal_ buffer (not the alternate-screen buffer).
	 * Read as `xterm.buffer.normal.length`.
	 */
	getBufferLength: () => number;
	/** Apply both dimensions now. */
	resizeBoth: (cols: number, rows: number) => void;
	/** Apply only the horizontal dimension (reflow). */
	resizeX: (cols: number) => void;
	/** Apply only the vertical dimension (cheap). */
	resizeY: (rows: number) => void;
}

export interface ResizeDebouncerOptions {
	/** Override the debounce interval (default: {@link DebounceMs}). */
	debounceMs?: number;
	/** Override the small-buffer threshold (default: {@link StartDebouncingThreshold}). */
	bufferThreshold?: number;
}

/**
 * Debounces horizontal terminal resizes (expensive reflow) while applying
 * vertical resizes immediately (cheap). Short-circuits on small buffers or
 * when the terminal is hidden.
 *
 * Upstream (VSCode terminalResizeDebouncer.ts):
 *
 *   export class TerminalResizeDebouncer extends Disposable {
 *       private _latestX: number = 0;
 *       private _latestY: number = 0;
 *       private readonly _resizeXJob = this._register(new MutableDisposable());
 *       private readonly _resizeYJob = this._register(new MutableDisposable());
 *       // ...
 *   }
 */
export class TerminalResizeDebouncer {
	private _latestX = 0;
	private _latestY = 0;
	private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private _idleXHandle: IdleHandle | null = null;
	private _idleYHandle: IdleHandle | null = null;

	private readonly _debounceMs: number;
	private readonly _bufferThreshold: number;

	constructor(
		private readonly _cb: ResizeDebouncerCallbacks,
		options: ResizeDebouncerOptions = {},
	) {
		this._debounceMs = options.debounceMs ?? DebounceMs;
		this._bufferThreshold = options.bufferThreshold ?? StartDebouncingThreshold;
	}

	/**
	 * Upstream (VSCode terminalResizeDebouncer.ts):
	 *
	 *   async resize(cols: number, rows: number, immediate: boolean): Promise<void> {
	 *       this._latestX = cols;
	 *       this._latestY = rows;
	 *
	 *       // Resize immediately if requested explicitly or if the buffer is small
	 *       if (immediate || this._getXterm()!.raw.buffer.normal.length < Constants.StartDebouncingThreshold) {
	 *           this._resizeXJob.clear();
	 *           this._resizeYJob.clear();
	 *           this._resizeBothCallback(cols, rows);
	 *           return;
	 *       }
	 *
	 *       // Resize in an idle callback if the terminal is not visible
	 *       const win = getWindow(this._getXterm()!.raw.element);
	 *       if (win && !this._isVisible()) {
	 *           if (!this._resizeXJob.value) {
	 *               this._resizeXJob.value = runWhenWindowIdle(win, async () => {
	 *                   this._resizeXCallback(this._latestX);
	 *                   this._resizeXJob.clear();
	 *               });
	 *           }
	 *           if (!this._resizeYJob.value) {
	 *               this._resizeYJob.value = runWhenWindowIdle(win, async () => {
	 *                   this._resizeYCallback(this._latestY);
	 *                   this._resizeYJob.clear();
	 *               });
	 *           }
	 *           return;
	 *       }
	 *
	 *       // Update dimensions independently as vertical resize is cheap and horizontal resize is
	 *       // expensive due to reflow.
	 *       this._resizeYCallback(rows);
	 *       this._latestX = cols;
	 *       this._debounceResizeX(cols);
	 *   }
	 */
	resize(cols: number, rows: number, immediate: boolean): void {
		this._latestX = cols;
		this._latestY = rows;

		// Resize immediately if requested explicitly or if the buffer is small
		if (immediate || this._cb.getBufferLength() < this._bufferThreshold) {
			this._clearX();
			this._clearY();
			this._cb.resizeBoth(cols, rows);
			return;
		}

		// Resize in an idle callback if the terminal is not visible
		if (!this._cb.isVisible()) {
			if (this._idleXHandle === null) {
				this._idleXHandle = scheduleIdle(() => {
					this._idleXHandle = null;
					this._cb.resizeX(this._latestX);
				});
			}
			if (this._idleYHandle === null) {
				this._idleYHandle = scheduleIdle(() => {
					this._idleYHandle = null;
					this._cb.resizeY(this._latestY);
				});
			}
			return;
		}

		// Update dimensions independently as vertical resize is cheap and horizontal resize is
		// expensive due to reflow.
		this._cb.resizeY(rows);
		this._debounceResizeX(cols);
	}

	/**
	 * Upstream (VSCode terminalResizeDebouncer.ts):
	 *
	 *   flush(): void {
	 *       if (this._resizeXJob.value || this._resizeYJob.value) {
	 *           this._resizeXJob.clear();
	 *           this._resizeYJob.clear();
	 *           this._resizeBothCallback(this._latestX, this._latestY);
	 *       }
	 *   }
	 */
	flush(): void {
		if (
			this._debounceTimer !== null ||
			this._idleXHandle !== null ||
			this._idleYHandle !== null
		) {
			this._clearX();
			this._clearY();
			this._cb.resizeBoth(this._latestX, this._latestY);
		}
	}

	/** Cancel any pending work without firing callbacks. Upstream: via `Disposable.dispose()`. */
	dispose(): void {
		this._clearX();
		this._clearY();
	}

	/**
	 * Upstream (VSCode terminalResizeDebouncer.ts):
	 *
	 *   @debounce(100)
	 *   private _debounceResizeX(cols: number) {
	 *       this._resizeXCallback(cols);
	 *   }
	 */
	private _debounceResizeX(cols: number): void {
		if (this._debounceTimer !== null) clearTimeout(this._debounceTimer);
		this._debounceTimer = setTimeout(() => {
			this._debounceTimer = null;
			this._cb.resizeX(cols);
		}, this._debounceMs);
	}

	private _clearX(): void {
		if (this._debounceTimer !== null) {
			clearTimeout(this._debounceTimer);
			this._debounceTimer = null;
		}
		if (this._idleXHandle !== null) {
			cancelIdle(this._idleXHandle);
			this._idleXHandle = null;
		}
	}

	private _clearY(): void {
		if (this._idleYHandle !== null) {
			cancelIdle(this._idleYHandle);
			this._idleYHandle = null;
		}
	}
}

// ---------------------------------------------------------------------------
// Idle-callback shim. Upstream uses VSCode's `runWhenWindowIdle`, which wraps
// `requestIdleCallback` with a setTimeout fallback for browsers that lack it
// (historically Safari). We mirror that here.
// ---------------------------------------------------------------------------

type IdleHandle =
	| { kind: "idle"; handle: number }
	| { kind: "timeout"; handle: ReturnType<typeof setTimeout> };

function scheduleIdle(cb: () => void): IdleHandle {
	if (
		typeof globalThis !== "undefined" &&
		typeof (globalThis as { requestIdleCallback?: unknown })
			.requestIdleCallback === "function"
	) {
		return {
			kind: "idle",
			handle: (
				globalThis as { requestIdleCallback: (cb: () => void) => number }
			).requestIdleCallback(cb),
		};
	}
	return { kind: "timeout", handle: setTimeout(cb, 0) };
}

function cancelIdle(handle: IdleHandle): void {
	if (handle.kind === "idle") {
		(
			globalThis as { cancelIdleCallback?: (h: number) => void }
		).cancelIdleCallback?.(handle.handle);
		return;
	}
	clearTimeout(handle.handle);
}
