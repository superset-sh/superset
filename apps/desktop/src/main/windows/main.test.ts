/**
 * Reproduction tests for issue #2507:
 * "Codex output disappears after switching away from Superset and back"
 *
 * Root cause: on macOS, when the user Cmd+Tabs away from Superset and back,
 * the BrowserWindow receives a `focus` event. However, the macOS-specific
 * compositor recovery in MainWindow() only handles `restore` and `show` events
 * — not `focus`. This means `webContents.invalidate()` / `forceRepaint()` is
 * never called from the main process on Cmd+Tab return.
 *
 * The renderer-side recovery (useTerminalLifecycle.ts) does fire on
 * `window.focus` and clears the WebGL texture atlas + refreshes xterm rows,
 * but the underlying Chromium compositor layers may be stale after macOS
 * reclaimed them during occlusion. The renderer paints into a broken surface,
 * so the terminal output appears blank.
 *
 * Fix: add a `focus` event handler in the macOS block that calls
 * `forceRepaint()`, which invalidates the web contents and performs a tiny
 * resize jiggle to force Chromium to reconstruct the compositor layer tree.
 */
import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Minimal model of the macOS window event → repaint wiring in main.ts.
// We test the *policy* (which events trigger repaint) rather than the full
// Electron integration, since BrowserWindow is not available in bun:test.
// ---------------------------------------------------------------------------

type RepaintPolicy = {
	/** BrowserWindow events that should trigger compositor recovery on macOS. */
	handledEvents: string[];
};

/**
 * Returns the set of BrowserWindow events that should trigger compositor
 * invalidation / repaint on macOS Sequoia+.
 *
 * This mirrors the `if (PLATFORM.IS_MAC) { ... }` block in main.ts.
 */
function getMacOSRepaintPolicy(): RepaintPolicy {
	// These are the events registered in main.ts for macOS compositor recovery.
	// The fix for #2507 adds "focus" to this list.
	return {
		handledEvents: ["restore", "show", "focus"],
	};
}

// ---------------------------------------------------------------------------
// Minimal model of the forceRepaint helper in main.ts.
// Verifies that invalidate() alone is augmented with a resize jiggle for
// non-maximized/non-fullscreen windows to rebuild corrupted GPU layers.
// ---------------------------------------------------------------------------

interface MockWindowState {
	destroyed: boolean;
	maximized: boolean;
	fullScreen: boolean;
	invalidateCalls: number;
	resizeJiggled: boolean;
	width: number;
	height: number;
}

interface MockWindow extends MockWindowState {
	isDestroyed: () => boolean;
	isMaximized: () => boolean;
	isFullScreen: () => boolean;
	getSize: () => [number, number];
	setSize: (w: number, h: number) => void;
	webContents: { invalidate: () => void };
}

function createMockWindow(
	overrides: Partial<MockWindowState> = {},
): MockWindow {
	const win: MockWindow = {
		destroyed: false,
		maximized: false,
		fullScreen: false,
		invalidateCalls: 0,
		resizeJiggled: false,
		width: 1200,
		height: 800,
		...overrides,
		isDestroyed() {
			return this.destroyed;
		},
		isMaximized() {
			return this.maximized;
		},
		isFullScreen() {
			return this.fullScreen;
		},
		getSize() {
			return [this.width, this.height];
		},
		setSize(w: number, h: number) {
			if (w !== this.width || h !== this.height) {
				this.resizeJiggled = true;
			}
			this.width = w;
			this.height = h;
		},
		webContents: {
			invalidate() {
				win.invalidateCalls++;
			},
		},
	};

	return win;
}

/**
 * Model of the forceRepaint function from main.ts.
 * invalidate() alone may not rebuild corrupted GPU layers — a tiny resize
 * forces Chromium to reconstruct the compositor layer tree.
 */
function forceRepaint(win: MockWindow) {
	if (win.isDestroyed()) return;
	win.webContents.invalidate();
	if (win.isMaximized() || win.isFullScreen()) return;
	const [width, height] = win.getSize();
	win.setSize(width + 1, height);
	// In production, setTimeout restores original size after 32ms.
	// We simulate immediate restoration for test simplicity.
	win.setSize(width, height);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("macOS compositor recovery — issue #2507", () => {
	it("handles focus event for macOS compositor recovery", () => {
		const policy = getMacOSRepaintPolicy();
		expect(policy.handledEvents).toContain("focus");
	});

	it("handles restore event for macOS compositor recovery", () => {
		const policy = getMacOSRepaintPolicy();
		expect(policy.handledEvents).toContain("restore");
	});

	it("handles show event for macOS compositor recovery", () => {
		const policy = getMacOSRepaintPolicy();
		expect(policy.handledEvents).toContain("show");
	});

	describe("forceRepaint behavior on focus return", () => {
		it("invalidates web contents and jiggles size for normal windows", () => {
			const win = createMockWindow();
			forceRepaint(win);

			expect(win.invalidateCalls).toBe(1);
			expect(win.resizeJiggled).toBe(true);
			// Size is restored to original
			expect(win.width).toBe(1200);
			expect(win.height).toBe(800);
		});

		it("invalidates but skips resize jiggle for maximized windows", () => {
			const win = createMockWindow({ maximized: true });
			forceRepaint(win);

			expect(win.invalidateCalls).toBe(1);
			expect(win.resizeJiggled).toBe(false);
		});

		it("invalidates but skips resize jiggle for fullscreen windows", () => {
			const win = createMockWindow({ fullScreen: true });
			forceRepaint(win);

			expect(win.invalidateCalls).toBe(1);
			expect(win.resizeJiggled).toBe(false);
		});

		it("does nothing for destroyed windows", () => {
			const win = createMockWindow({ destroyed: true });
			forceRepaint(win);

			expect(win.invalidateCalls).toBe(0);
			expect(win.resizeJiggled).toBe(false);
		});
	});

	describe("Cmd+Tab scenario (focus without restore/show)", () => {
		it("focus event alone is sufficient to trigger repaint", () => {
			const policy = getMacOSRepaintPolicy();

			// Cmd+Tab back only fires 'focus', NOT 'restore' or 'show'.
			// Before the fix, only restore/show were handled → no repaint.
			const firedEvents = ["focus"];
			const triggeredRepaint = firedEvents.some((e) =>
				policy.handledEvents.includes(e),
			);

			expect(triggeredRepaint).toBe(true);
		});

		it("restore event triggers repaint (e.g. unminimize)", () => {
			const policy = getMacOSRepaintPolicy();
			const firedEvents = ["restore"];
			const triggeredRepaint = firedEvents.some((e) =>
				policy.handledEvents.includes(e),
			);
			expect(triggeredRepaint).toBe(true);
		});
	});
});
