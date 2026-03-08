/**
 * Regression test for issue #2017 — blank screen on macOS after updating.
 *
 * Root cause: the `show` and `restore` event handlers in main.ts called
 * `window.webContents.invalidate()` directly instead of `forceRepaint()`.
 * For non-maximized windows `invalidate()` alone does not force Chromium to
 * reconstruct the compositor layer tree, which can leave a blank window on
 * macOS when the GPU compositor state is stale (e.g. after an app update
 * that restarts the GPU process, or after minimise/restore).
 *
 * The fix: replace bare `invalidate()` calls in the show/restore handlers
 * with `forceRepaint()`, which additionally performs a 1-pixel resize to
 * force a full compositor rebuild.
 */
import { describe, expect, it, mock } from "bun:test";
import type { BrowserWindow } from "electron";
import { forceRepaint } from "./force-repaint";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockWindow(opts: {
	isDestroyed?: boolean;
	isMaximized?: boolean;
	isFullScreen?: boolean;
	width?: number;
	height?: number;
}): BrowserWindow {
	const invalidate = mock(() => {});
	const setSize = mock(() => {});
	const getSize = mock(
		() => [opts.width ?? 1200, opts.height ?? 800] as [number, number],
	);
	let destroyed = opts.isDestroyed ?? false;

	return {
		isDestroyed: () => destroyed,
		isMaximized: () => opts.isMaximized ?? false,
		isFullScreen: () => opts.isFullScreen ?? false,
		getSize,
		setSize,
		webContents: { invalidate },
		// Expose the mock so tests can check calls
		_mocks: { invalidate, setSize, getSize },
		_setDestroyed: (v: boolean) => {
			destroyed = v;
		},
	} as unknown as BrowserWindow;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("forceRepaint", () => {
	describe("destroyed window", () => {
		it("does nothing when window is already destroyed", () => {
			const win = makeMockWindow({ isDestroyed: true });
			forceRepaint(win);
			// biome-ignore lint/suspicious/noExplicitAny: test helper
			expect((win as any)._mocks.invalidate).not.toHaveBeenCalled();
			// biome-ignore lint/suspicious/noExplicitAny: test helper
			expect((win as any)._mocks.setSize).not.toHaveBeenCalled();
		});
	});

	describe("non-maximized, non-fullscreen window", () => {
		it("calls invalidate() to mark contents dirty", () => {
			const win = makeMockWindow({ width: 1200, height: 800 });
			forceRepaint(win);
			// biome-ignore lint/suspicious/noExplicitAny: test helper
			expect((win as any)._mocks.invalidate).toHaveBeenCalledTimes(1);
		});

		it("expands width by 1px to force compositor layer rebuild", () => {
			const win = makeMockWindow({ width: 1200, height: 800 });
			forceRepaint(win);
			// The +1 px resize forces Chromium to reconstruct compositor layers —
			// this is the repair that `invalidate()` alone cannot achieve.
			// biome-ignore lint/suspicious/noExplicitAny: test helper
			expect((win as any)._mocks.setSize).toHaveBeenCalledWith(1201, 800);
		});

		it("reverts the resize to the original size after 32 ms", async () => {
			const win = makeMockWindow({ width: 1200, height: 800 });
			forceRepaint(win);

			// biome-ignore lint/suspicious/noExplicitAny: test helper
			expect((win as any)._mocks.setSize).toHaveBeenCalledTimes(1);

			await new Promise((r) => setTimeout(r, 50));

			// biome-ignore lint/suspicious/noExplicitAny: test helper
			expect((win as any)._mocks.setSize).toHaveBeenCalledTimes(2);
			// biome-ignore lint/suspicious/noExplicitAny: test helper
			expect((win as any)._mocks.setSize).toHaveBeenLastCalledWith(1200, 800);
		});

		it("skips the revert if window is destroyed before the timeout fires", async () => {
			const win = makeMockWindow({ width: 1200, height: 800 });
			forceRepaint(win);

			// Destroy the window before the 32 ms revert fires
			// biome-ignore lint/suspicious/noExplicitAny: test helper
			(win as any)._setDestroyed(true);

			await new Promise((r) => setTimeout(r, 50));

			// Only the expand call should have been made, not the revert
			// biome-ignore lint/suspicious/noExplicitAny: test helper
			expect((win as any)._mocks.setSize).toHaveBeenCalledTimes(1);
		});
	});

	describe("maximized window", () => {
		it("calls invalidate()", () => {
			const win = makeMockWindow({ isMaximized: true });
			forceRepaint(win);
			// biome-ignore lint/suspicious/noExplicitAny: test helper
			expect((win as any)._mocks.invalidate).toHaveBeenCalledTimes(1);
		});

		it("does NOT call setSize (would unmaximize the window)", () => {
			const win = makeMockWindow({ isMaximized: true });
			forceRepaint(win);
			// biome-ignore lint/suspicious/noExplicitAny: test helper
			expect((win as any)._mocks.setSize).not.toHaveBeenCalled();
		});
	});

	describe("fullscreen window", () => {
		it("calls invalidate()", () => {
			const win = makeMockWindow({ isFullScreen: true });
			forceRepaint(win);
			// biome-ignore lint/suspicious/noExplicitAny: test helper
			expect((win as any)._mocks.invalidate).toHaveBeenCalledTimes(1);
		});

		it("does NOT call setSize (would exit fullscreen)", () => {
			const win = makeMockWindow({ isFullScreen: true });
			forceRepaint(win);
			// biome-ignore lint/suspicious/noExplicitAny: test helper
			expect((win as any)._mocks.setSize).not.toHaveBeenCalled();
		});
	});
});
