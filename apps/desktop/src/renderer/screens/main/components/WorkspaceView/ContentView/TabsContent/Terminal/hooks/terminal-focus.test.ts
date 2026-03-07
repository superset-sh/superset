/**
 * Reproduction tests for issue #2182:
 * "Terminal input loses focus intermittently"
 *
 * Root cause: When a terminal pane is already marked as focused in the tabs store
 * (`focusedPaneIds[tabId] === paneId`), clicking on the terminal calls
 * `setFocusedPane(tabId, paneId)` — but since the store value doesn't change,
 * React's selector returns the same string, no re-render occurs, and the
 * `useTerminalHotkeys` effect never fires. Consequently `xterm.focus()` is
 * never called, and keyboard input stops working.
 *
 * The fix adds a dedicated focus-callback registration (similar to the existing
 * clear/paste callbacks in `useTerminalCallbacksStore`). Terminal lifecycle code
 * registers `() => xterm.focus()` for each pane, and `TabPane` calls that
 * callback on every focus event — whether or not the store state changed.
 */
import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Pure model of the selector-based focus mechanism.
// Demonstrates why the bug occurs without requiring React rendering.
// ---------------------------------------------------------------------------

type FocusedPaneIds = Record<string, string | undefined>;

/**
 * Simulate the React selector used in `useTerminalHotkeys`:
 * ```ts
 * const focusedPaneId = useTabsStore((s) => s.focusedPaneIds[tabId]);
 * const isFocused = focusedPaneId === paneId;
 * ```
 * The effect `[isFocused, xtermRef]` only fires when `isFocused` changes.
 */
function simulateFocusEffect(
	prevFocusedPaneIds: FocusedPaneIds,
	nextFocusedPaneIds: FocusedPaneIds,
	tabId: string,
	paneId: string,
	focusFn: () => void,
): void {
	const prevIsFocused = prevFocusedPaneIds[tabId] === paneId;
	const nextIsFocused = nextFocusedPaneIds[tabId] === paneId;

	// React only re-runs the effect when the dependency changes
	if (prevIsFocused !== nextIsFocused && nextIsFocused) {
		focusFn();
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Terminal focus — issue #2182", () => {
	it("xterm.focus() is called when pane gains focus for the first time", () => {
		let focusCalled = 0;

		simulateFocusEffect(
			{}, // no pane focused yet
			{ "tab-1": "pane-1" }, // pane-1 becomes focused
			"tab-1",
			"pane-1",
			() => {
				focusCalled++;
			},
		);

		expect(focusCalled).toBe(1);
	});

	it("xterm.focus() is called when switching focus from pane B to pane A", () => {
		let focusCalled = 0;

		simulateFocusEffect(
			{ "tab-1": "pane-2" }, // pane-2 was focused
			{ "tab-1": "pane-1" }, // user switches to pane-1
			"tab-1",
			"pane-1",
			() => {
				focusCalled++;
			},
		);

		expect(focusCalled).toBe(1);
	});

	/**
	 * REPRODUCTION TEST — demonstrates the bug.
	 *
	 * When the user clicks on a terminal pane that is *already* the focused pane
	 * in the store (e.g. after the pane lost DOM focus due to a native Electron
	 * event), `setFocusedPane` produces the same value in the store. React's
	 * selector returns the same string, `isFocused` doesn't change, the
	 * `useTerminalHotkeys` effect never fires, and `xterm.focus()` is never
	 * called — so keyboard input remains broken until the user switches tabs and
	 * back.
	 */
	it("REPRODUCES BUG: clicking already-focused pane does not call xterm.focus()", () => {
		let focusCalled = 0;

		simulateFocusEffect(
			{ "tab-1": "pane-1" }, // pane-1 already focused
			{ "tab-1": "pane-1" }, // same pane re-selected (no change)
			"tab-1",
			"pane-1",
			() => {
				focusCalled++;
			},
		);

		// BUG: xterm.focus() is NOT called because isFocused didn't change
		expect(focusCalled).toBe(0);
	});

	/**
	 * FIX — a dedicated focus-callback bypasses the React re-render gate.
	 *
	 * Instead of relying solely on the `isFocused` React effect, the terminal
	 * registers an imperative focus callback in `useTerminalCallbacksStore`.
	 * `TabPane` calls this callback on every `setFocusedPane`, ensuring
	 * `xterm.focus()` is always invoked whenever the user interacts with the
	 * pane — even when `isFocused` is already `true`.
	 */
	it("FIX: imperative focus callback fires even when pane is already focused", () => {
		// Simulate the focus-callback registry
		const focusCallbacks = new Map<string, () => void>();

		let xtermFocusCalled = 0;

		// Terminal lifecycle registers the callback when xterm is ready
		const paneId = "pane-1";
		focusCallbacks.set(paneId, () => {
			xtermFocusCalled++;
		});

		// Simulate the fixed handleFocusedPane in TabPane: always call the callback
		const handleFocusedPane = (pid: string) => {
			// setFocusedPane(tabId, pid) — may be a no-op in the store
			// but the callback is called unconditionally:
			focusCallbacks.get(pid)?.();
		};

		// User clicks on already-focused pane
		handleFocusedPane(paneId);
		handleFocusedPane(paneId); // clicking twice should still work

		// FIX: xterm.focus() IS called each time the pane is activated
		expect(xtermFocusCalled).toBe(2);
	});

	it("FIX: focus callback is NOT called for a different pane", () => {
		const focusCallbacks = new Map<string, () => void>();

		let pane1FocusCalled = 0;
		let pane2FocusCalled = 0;

		focusCallbacks.set("pane-1", () => {
			pane1FocusCalled++;
		});
		focusCallbacks.set("pane-2", () => {
			pane2FocusCalled++;
		});

		const handleFocusedPane = (pid: string) => {
			focusCallbacks.get(pid)?.();
		};

		// Only pane-2 is focused
		handleFocusedPane("pane-2");

		expect(pane1FocusCalled).toBe(0);
		expect(pane2FocusCalled).toBe(1);
	});

	it("FIX: unregistered pane does not throw", () => {
		const focusCallbacks = new Map<string, () => void>();

		// No callback registered for pane-99
		const handleFocusedPane = (pid: string) => {
			focusCallbacks.get(pid)?.();
		};

		expect(() => handleFocusedPane("pane-99")).not.toThrow();
	});
});
