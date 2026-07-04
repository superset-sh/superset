import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";

/**
 * Owns the WebGL renderer lifecycle for one xterm instance.
 *
 * Chromium caps live WebGL contexts per renderer process (~16) and silently
 * evicts the least-recently-used one past the cap. Terminals park off-screen
 * indefinitely (terminal-parking.ts), so holding a context for every terminal
 * ever opened guarantees evictions once enough panes accumulate. Instead the
 * context is acquired on attach and released on park, bounding live contexts
 * to visible terminals. A parked terminal falls back to the DOM renderer,
 * which costs nothing while hidden: xterm's IntersectionObserver pauses
 * rendering off-viewport and full-refreshes on resume.
 *
 * Context loss while attached falls back to the DOM renderer for this
 * terminal only and retries WebGL on the next acquire (i.e. next attach).
 * Load failure (no GPU support) disables WebGL for this terminal only —
 * never globally: the old module-wide latch permanently downgraded every
 * future terminal in the session after a single loss.
 */

export type WebglFallbackReason = "context-loss" | "load-failed";

export interface WebglRendererController {
	/**
	 * Load the WebGL addon, deferred to rAF to avoid racing xterm's post-open
	 * viewport sync. Idempotent while a load is pending or active.
	 */
	acquire(): void;
	/** Dispose the addon (and its GPU context), or cancel a pending load. */
	release(): void;
	/** Release and stop accepting further acquires. */
	dispose(): void;
}

/** Structural subset of WebglAddon, injectable for tests. */
export interface WebglAddonLike {
	activate(terminal: XTerm): void;
	dispose(): void;
	onContextLoss(listener: () => void): { dispose(): void };
}

function reportFallback(reason: WebglFallbackReason, error?: unknown) {
	console.warn(
		`[terminal] WebGL renderer fallback (${reason}); using DOM renderer for this terminal`,
		error ?? "",
	);
	// Lazy import keeps posthog out of the module graph for tests and for the
	// common path where WebGL never fails.
	void import("renderer/lib/analytics")
		.then(({ track }) => track("terminal_webgl_fallback", { reason }))
		.catch(() => {});
}

export function createWebglRendererController(
	terminal: XTerm,
	options: {
		createAddon?: () => WebglAddonLike;
		onFallback?: (reason: WebglFallbackReason, error?: unknown) => void;
	} = {},
): WebglRendererController {
	const createAddon = options.createAddon ?? (() => new WebglAddon());
	const onFallback = options.onFallback ?? reportFallback;

	let addon: WebglAddonLike | null = null;
	let frameId: number | null = null;
	let disposed = false;
	// Only set on load failure (no GPU/driver support) — a lost context is
	// transient and retried on the next acquire instead.
	let loadFailed = false;

	function release() {
		if (frameId !== null) {
			cancelAnimationFrame(frameId);
			frameId = null;
		}
		if (addon) {
			const current = addon;
			addon = null;
			try {
				current.dispose();
			} catch {}
		}
	}

	function acquire() {
		if (disposed || loadFailed) return;
		if (addon || frameId !== null) return;

		frameId = requestAnimationFrame(() => {
			frameId = null;
			if (disposed || loadFailed || addon) return;

			try {
				const next = createAddon();
				next.onContextLoss(() => {
					// GPU reset or context eviction. Drop to the DOM renderer for
					// this terminal; the next attach retries WebGL.
					if (addon === next) {
						addon = null;
					}
					try {
						next.dispose();
					} catch {}
					onFallback("context-loss");
					if (!disposed) {
						terminal.refresh(0, Math.max(0, terminal.rows - 1));
					}
				});
				terminal.loadAddon(next);
				addon = next;
			} catch (error) {
				loadFailed = true;
				onFallback("load-failed", error);
			}
		});
	}

	return {
		acquire,
		release,
		dispose() {
			if (disposed) return;
			disposed = true;
			release();
		},
	};
}
