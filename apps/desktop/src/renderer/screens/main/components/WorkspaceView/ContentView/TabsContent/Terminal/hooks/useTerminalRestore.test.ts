/**
 * Reproduction test for GitHub issue #1830:
 * "When I switch away from a terminal tab and come back, the input bar appears
 * twice. Additionally, the terminal view is auto-scrolled to the bottom."
 *
 * Root cause (scroll): maybeApplyInitialState calls scrollToBottom()
 * unconditionally after writing the terminal snapshot. It never checks whether
 * the user was at the bottom before the tab switch, so it always scrolls
 * to the bottom — even when the user had scrolled up to read earlier output.
 *
 * Root cause (double prompt): After the snapshot is written, flushPendingEvents()
 * replays all stream events buffered during the restore. If the PTY session sent
 * a shell-prompt repaint (e.g., in response to SIGWINCH on reattach) while the
 * terminal was unmounted, that repaint is buffered and flushed after the
 * snapshot — resulting in two prompts: one from the snapshot and one from the
 * flush.
 */

import { afterEach, describe, expect, it, mock } from "bun:test";

// Mock React before importing the hook so hooks work without a DOM renderer.
mock.module("react", () => ({
	useRef: <T>(initial: T) => ({ current: initial }),
	useCallback: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

// Make requestAnimationFrame run its callback synchronously in tests.
if (
	typeof (globalThis as Record<string, unknown>).requestAnimationFrame ===
	"undefined"
) {
	(globalThis as Record<string, unknown>).requestAnimationFrame = (
		cb: (time: number) => void,
	) => {
		cb(0);
		return 0;
	};
}

// Import AFTER mocks are registered.
const { useTerminalRestore } = await import("./useTerminalRestore");
// scrollPositionState is populated by useTerminalLifecycle on unmount; we set
// it directly in tests to simulate a previous tab switch.
const { scrollPositionState } = await import("../state");

// ─── helpers ────────────────────────────────────────────────────────────────

type FakeFitAddon = { fit: ReturnType<typeof mock> };
type FakeXterm = {
	write: ReturnType<typeof mock>;
	scrollToBottom: ReturnType<typeof mock>;
	buffer: { active: { viewportY: number; baseY: number } };
};

function makeFakeXterm(viewportY: number, baseY: number): FakeXterm {
	return {
		// write() stores the data and immediately calls the optional callback.
		write: mock((_data: string, callback?: () => void) => {
			callback?.();
		}),
		scrollToBottom: mock(() => {}),
		buffer: { active: { viewportY, baseY } },
	};
}

function makeHookInput(xterm: FakeXterm) {
	const fitAddon: FakeFitAddon = { fit: mock(() => {}) };
	return {
		paneId: "test-pane",
		xtermRef: { current: xterm as unknown } as React.MutableRefObject<null>,
		fitAddonRef: {
			current: fitAddon as unknown,
		} as React.MutableRefObject<null>,
		pendingEventsRef: {
			current: [] as Array<{ type: string; data?: string }>,
		} as React.MutableRefObject<never[]>,
		isAlternateScreenRef: { current: false },
		isBracketedPasteRef: { current: false },
		modeScanBufferRef: { current: "" },
		updateCwdFromData: mock(() => {}),
		updateModesFromData: mock(() => {}),
		onExitEvent: mock(() => {}),
		onErrorEvent: mock(() => {}),
		onDisconnectEvent: mock(() => {}),
	};
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("useTerminalRestore – bug #1830", () => {
	afterEach(() => {
		// Clean up shared module-level state between tests.
		scrollPositionState.clear();
	});

	describe("scroll position not preserved after tab switch", () => {
		it("should NOT scroll to bottom when user was scrolled up", () => {
			// User is mid-scroll: viewportY (5) is less than baseY (20).
			const xterm = makeFakeXterm(5, 20);
			const input = makeHookInput(xterm);
			const restore = useTerminalRestore(input);

			// Simulate what useTerminalLifecycle saves on unmount: user was NOT
			// at the bottom (scrolled up to read earlier output).
			scrollPositionState.set(input.paneId, { wasAtBottom: false });

			restore.didFirstRenderRef.current = true;
			restore.pendingInitialStateRef.current = {
				wasRecovered: false,
				isNew: false,
				scrollback: "$ ls\r\nfoo bar baz\r\n$ ",
			};

			restore.maybeApplyInitialState();

			// BUG: scrollToBottom IS called even though the user was scrolled up.
			// After the fix, this call should be suppressed when
			// viewportY < baseY (user was not at the bottom).
			expect(xterm.scrollToBottom).not.toHaveBeenCalled();
		});

		it("should scroll to bottom when user was already at the bottom", () => {
			// User is at the bottom: viewportY (20) equals baseY (20).
			const xterm = makeFakeXterm(20, 20);
			const input = makeHookInput(xterm);
			const restore = useTerminalRestore(input);

			// Simulate what useTerminalLifecycle saves on unmount: user WAS
			// already at the bottom.
			scrollPositionState.set(input.paneId, { wasAtBottom: true });

			restore.didFirstRenderRef.current = true;
			restore.pendingInitialStateRef.current = {
				wasRecovered: false,
				isNew: false,
				scrollback: "$ ls\r\nfoo bar baz\r\n$ ",
			};

			restore.maybeApplyInitialState();

			// When the user was already at the bottom, scrolling to the bottom
			// after restore is the correct behaviour.
			expect(xterm.scrollToBottom).toHaveBeenCalledTimes(1);
		});
	});

	describe("double prompt mechanism on tab switch", () => {
		it("writes snapshot then flushes buffered stream events (may duplicate shell prompt)", () => {
			// Track the exact sequence of data written to the terminal.
			const writtenData: string[] = [];
			const xterm: FakeXterm = {
				write: mock((data: string, callback?: () => void) => {
					writtenData.push(data);
					callback?.();
				}),
				scrollToBottom: mock(() => {}),
				// User was at the bottom before the tab switch.
				buffer: { active: { viewportY: 20, baseY: 20 } },
			};

			const input = makeHookInput(xterm);
			const restore = useTerminalRestore(input);

			// User was at the bottom before the tab switch.
			scrollPositionState.set(input.paneId, { wasAtBottom: true });

			// Simulate a shell-prompt repaint buffered during the tab switch.
			// When the PTY session receives SIGWINCH on reattach, many shells
			// respond by reprinting the current input line (which includes the
			// prompt). If that repaint is flushed after the snapshot, the
			// terminal ends up with two identical prompts.
			(input.pendingEventsRef as { current: unknown[] }).current = [
				{ type: "data", data: "\r\n$ " },
			];

			restore.didFirstRenderRef.current = true;
			restore.pendingInitialStateRef.current = {
				wasRecovered: false,
				isNew: false,
				// Snapshot ends with the shell prompt.
				scrollback: "$ ls\r\nfoo bar baz\r\n$ ",
			};

			restore.maybeApplyInitialState();

			// The snapshot (with its trailing prompt) is written first.
			expect(writtenData[0]).toBe("$ ls\r\nfoo bar baz\r\n$ ");
			// Then the buffered repaint is flushed — introducing a second prompt.
			expect(writtenData[1]).toBe("\r\n$ ");
		});
	});
});
