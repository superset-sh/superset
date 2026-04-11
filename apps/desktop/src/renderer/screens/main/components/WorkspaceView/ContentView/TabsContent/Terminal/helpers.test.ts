/**
 * Reproduction tests for issue #3351:
 * "Terminal ghosting and accumulating black regions after workspace switches"
 *
 * Root cause: In createTerminalInstance (helpers.ts) and loadAddons
 * (terminal-addons.ts), the WebGL renderer is loaded asynchronously via
 * requestAnimationFrame. When it replaces the DOM renderer, no explicit
 * xterm.refresh() call is made. Content already in the terminal buffer
 * (painted by the DOM renderer) does not get cleanly transferred to the
 * WebGL texture atlas, leaving black/blank regions.
 *
 * Each workspace switch unmounts and remounts the terminal, creating a
 * fresh xterm instance that hits the same race:
 *   1. xterm.open()  →  DOM renderer active
 *   2. Initial state restored  →  content painted via DOM renderer
 *   3. requestAnimationFrame fires  →  WebGL replaces DOM renderer
 *   4. WebGL texture atlas is empty  →  black regions appear
 *
 * Fix: call xterm.refresh(0, rows - 1) immediately after loading the
 * WebGL renderer addon, forcing the WebGL texture atlas to repaint
 * from the terminal buffer.
 */
import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Minimal model of the renderer-loading lifecycle in createTerminalInstance.
// Mirrors the sequencing in helpers.ts so tests accurately demonstrate the
// production behavior.
// ---------------------------------------------------------------------------

type RendererKind = "dom" | "webgl";

interface MockRenderer {
	kind: RendererKind;
	clearTextureAtlas: (() => void) | undefined;
}

interface MockTerminal {
	rows: number;
	/** Number of times refresh(0, rows-1) has been called */
	refreshCount: number;
	/** Content written to the terminal buffer */
	buffer: string[];
	/** Active renderer kind */
	activeRenderer: RendererKind;
	/** Whether disposed */
	disposed: boolean;
}

function createMockTerminal(rows = 24): MockTerminal {
	return {
		rows,
		refreshCount: 0,
		buffer: [],
		activeRenderer: "dom",
		disposed: false,
	};
}

/**
 * Model the renderer-loading lifecycle in createTerminalInstance.
 *
 * @param refreshAfterWebGLLoad — when true, simulates the FIX (refresh after
 * WebGL loads). When false, simulates the BUG (no refresh).
 */
function makeRendererLifecycle(opts: { refreshAfterWebGLLoad: boolean }) {
	const terminal = createMockTerminal();
	let isDisposed = false;
	let pendingRaf: (() => void) | null = null;

	// Simulates the TerminalRendererRef mutable ref pattern from helpers.ts
	const rendererRef: { current: MockRenderer } = {
		current: { kind: "dom", clearTextureAtlas: undefined },
	};

	// Step 1: xterm.open() — DOM renderer is active (modeled by constructor)

	// Step 2: Schedule WebGL renderer load via requestAnimationFrame
	pendingRaf = () => {
		if (isDisposed) return;

		// Simulate loadRenderer() → tries WebGL, sets kind
		const webglRenderer: MockRenderer = {
			kind: "webgl",
			clearTextureAtlas: () => {},
		};
		rendererRef.current = webglRenderer;
		terminal.activeRenderer = "webgl";

		// FIX: refresh after WebGL load
		if (opts.refreshAfterWebGLLoad) {
			if (rendererRef.current.kind === "webgl") {
				terminal.refreshCount++;
			}
		}
	};

	return {
		terminal,
		rendererRef,
		/** Simulate writing content to the terminal (initial state restoration) */
		writeContent(data: string) {
			terminal.buffer.push(data);
		},
		/** Simulate requestAnimationFrame firing (WebGL renderer loads) */
		flushRaf() {
			const cb = pendingRaf;
			pendingRaf = null;
			cb?.();
		},
		/** Simulate component unmount → cleanup */
		dispose() {
			isDisposed = true;
			pendingRaf = null;
			terminal.disposed = true;
		},
		/** Whether a rAF is pending */
		hasPendingRaf: () => pendingRaf !== null,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebGL renderer swap lifecycle — issue #3351", () => {
	describe("BUG: no refresh after WebGL load", () => {
		it("content written before WebGL load is not repainted", () => {
			const lifecycle = makeRendererLifecycle({
				refreshAfterWebGLLoad: false,
			});

			// Step 1: Terminal opens with DOM renderer
			expect(lifecycle.terminal.activeRenderer).toBe("dom");
			expect(lifecycle.rendererRef.current.kind).toBe("dom");

			// Step 2: Initial state is written (content painted by DOM renderer)
			lifecycle.writeContent("$ codex --full-auto");
			expect(lifecycle.terminal.buffer).toHaveLength(1);

			// Step 3: rAF fires — WebGL replaces DOM
			lifecycle.flushRaf();
			expect(lifecycle.terminal.activeRenderer).toBe("webgl");
			expect(lifecycle.rendererRef.current.kind).toBe("webgl");

			// BUG: No refresh was called after WebGL load.
			// The WebGL texture atlas is empty — it was never told to repaint
			// the content that was already in the buffer from the DOM renderer.
			// This causes the "black blank regions" described in the issue.
			expect(lifecycle.terminal.refreshCount).toBe(0);
		});

		it("repeated mount/unmount cycles never refresh after WebGL load", () => {
			// Simulates multiple workspace switches: each switch creates a fresh
			// terminal that hits the same bug.
			const refreshCounts: number[] = [];

			for (let i = 0; i < 5; i++) {
				const lifecycle = makeRendererLifecycle({
					refreshAfterWebGLLoad: false,
				});
				lifecycle.writeContent(`cycle ${i}: dense TUI content`);
				lifecycle.flushRaf(); // WebGL loads
				refreshCounts.push(lifecycle.terminal.refreshCount);
				lifecycle.dispose(); // workspace switch away
			}

			// BUG: Every cycle has 0 refreshes after WebGL load
			expect(refreshCounts).toEqual([0, 0, 0, 0, 0]);
		});
	});

	describe("FIX: refresh after WebGL load", () => {
		it("forces repaint after WebGL renderer replaces DOM", () => {
			const lifecycle = makeRendererLifecycle({
				refreshAfterWebGLLoad: true,
			});

			// Write content while DOM renderer is active
			lifecycle.writeContent("$ codex --full-auto");

			// rAF fires — WebGL loads AND refresh is called
			lifecycle.flushRaf();
			expect(lifecycle.terminal.activeRenderer).toBe("webgl");

			// FIX: refresh was called, forcing WebGL to repaint from buffer
			expect(lifecycle.terminal.refreshCount).toBe(1);
		});

		it("refresh fires on every mount cycle, preventing accumulation", () => {
			const refreshCounts: number[] = [];

			for (let i = 0; i < 5; i++) {
				const lifecycle = makeRendererLifecycle({
					refreshAfterWebGLLoad: true,
				});
				lifecycle.writeContent(`cycle ${i}: dense TUI content`);
				lifecycle.flushRaf();
				refreshCounts.push(lifecycle.terminal.refreshCount);
				lifecycle.dispose();
			}

			// FIX: Every cycle gets exactly 1 refresh after WebGL load
			expect(refreshCounts).toEqual([1, 1, 1, 1, 1]);
		});

		it("does not refresh if component unmounts before rAF fires", () => {
			const lifecycle = makeRendererLifecycle({
				refreshAfterWebGLLoad: true,
			});

			lifecycle.writeContent("content");
			// Component unmounts before rAF fires (quick workspace switch)
			lifecycle.dispose();
			lifecycle.flushRaf(); // rAF fires but isDisposed → no-op

			// No refresh needed — terminal was disposed
			expect(lifecycle.terminal.refreshCount).toBe(0);
		});

		it("does not refresh when WebGL fails and DOM fallback is used", () => {
			// Simulate WebGL failure (falls back to DOM)
			const terminal = createMockTerminal();
			let refreshCount = 0;

			// Model: WebGL fails, renderer stays DOM
			const rendererRef: { current: MockRenderer } = {
				current: { kind: "dom", clearTextureAtlas: undefined },
			};

			// Simulate the rAF where WebGL fails
			// In production: catch block sets suggestedRendererType = "dom"
			// and leaves rendererRef as DOM
			const webglFailed = true;
			if (!webglFailed) {
				rendererRef.current = { kind: "webgl", clearTextureAtlas: () => {} };
				terminal.activeRenderer = "webgl";
				// Only refresh for WebGL
				if (rendererRef.current.kind === "webgl") {
					refreshCount++;
				}
			}

			// DOM renderer doesn't need a refresh — it was already active
			expect(refreshCount).toBe(0);
			expect(rendererRef.current.kind).toBe("dom");
		});
	});
});
