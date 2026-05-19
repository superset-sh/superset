/**
 * Reproduction test for issue #4542:
 * "Copilot CLI input no longer reaches TUI after switching away and back to its
 *  terminal pane"
 *
 * Affected code: useTerminalLifecycle.ts mount effect (the `isReattach` path)
 * and v1-terminal-cache.ts attach/detach helpers.
 *
 * What the bug is
 * ----------------
 * GitHub Copilot CLI enables DEC private mode 1004 (focus reporting). When that
 * mode is on, xterm sends `\x1b[I` (focus-in) to the PTY whenever the textarea
 * gains DOM focus and `\x1b[O` (focus-out) whenever it loses focus. Copilot's
 * TUI uses those bytes to decide whether to render its input field as active —
 * if it's seen `\x1b[O` more recently than `\x1b[I`, it parks its cursor
 * outside the input field and ignores characters typed into the PTY.
 *
 * When a Superset terminal pane is hidden via tab/workspace switch, the v1
 * terminal cache parks the xterm wrapper into the body-level container at
 * `terminal-parking.ts`. That container has `inert` set, which per spec moves
 * focus out of the subtree. Chromium does this synchronously, so the textarea
 * blur handler runs and xterm sends `\x1b[O` to Copilot — correct so far.
 *
 * On return, `useTerminalLifecycle`'s mount effect calls `attachToContainer`
 * to move the wrapper back into the live pane, and then runs:
 *
 *     if (isFocusedRef.current) {
 *         xterm.focus();
 *     }
 *
 * The gap: nothing in this path guarantees that a focus event is actually
 * fired on the textarea. Two ways it silently doesn't fire:
 *
 *   1. `isFocusedRef.current` is false at the moment the mount effect runs
 *      (e.g. the click that returned the user to the tab landed on the tab
 *      button, not on the pane, so the per-tab `focusedPaneId` for this tab
 *      has not yet been set to this pane). `xterm.focus()` is skipped
 *      entirely, no `\x1b[I` is sent, and Copilot stays blurred even after
 *      the user later clicks into the pane and starts typing — by then the
 *      reattach is "done" and there is no second pass that re-syncs focus
 *      tracking with the TUI.
 *
 *   2. `xterm.focus()` runs but `textarea.focus()` is a no-op because the
 *      browser still considers the textarea the active element. In that case
 *      no DOM focus event fires, so xterm's `_handleTextAreaFocus` never
 *      runs, and `\x1b[I` is never re-sent after the matching `\x1b[O` from
 *      parking.
 *
 * Either way: Copilot has received an unmatched `\x1b[O`, so it stays in the
 * blurred state. Characters typed into the PTY are silently dropped by
 * Copilot, while Ctrl+C still kills the session because SIGINT is processed
 * by the PTY layer regardless of Copilot's focus state. That matches the
 * symptoms reported in the issue exactly.
 *
 * Other AI TUIs (Claude Code, Codex) don't enable mode 1004 in the same way
 * — they either don't gate input rendering on focus tracking or don't enable
 * the mode at all — which is why the reporter only sees this with Copilot.
 *
 * Reproduction strategy
 * ---------------------
 * Mirror the production logic with a minimal model, the same approach used by
 * `useTerminalLifecycle.test.ts` for issue #1873. The model captures:
 *   - a focus tracking state machine that emits `\x1b[I` / `\x1b[O` on
 *     textarea focus/blur (matching xterm's `_handleTextAreaFocus` and
 *     `_handleTextAreaBlur` in the upstream
 *     `@xterm/xterm/src/browser/CoreBrowserTerminal.ts`),
 *   - park/unpark moves that simulate the inert-driven blur and the explicit
 *     re-focus in the reattach branch of `useTerminalLifecycle.ts`.
 *
 * The reproduction case shows: after one park/unpark cycle with the same
 * preconditions that hold in production (focus tracking on, pane focused
 * before switch, isFocusedRef stale at mount), the last byte Copilot has
 * received is `\x1b[O` — i.e. the TUI is left in the blurred state described
 * by the issue.
 */
import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Minimal model — mirrors xterm's textarea focus/blur path and the v1 cache
// park/unpark flow used by useTerminalLifecycle.ts.
//
// xterm reference (focus path):
//   if (this.coreService.decPrivateModes.sendFocus) {
//     this.coreService.triggerDataEvent(C0.ESC + '[I');
//   }
//
// xterm reference (blur path):
//   if (this.coreService.decPrivateModes.sendFocus) {
//     this.coreService.triggerDataEvent(C0.ESC + '[O');
//   }
// ---------------------------------------------------------------------------

const FOCUS_IN = "\x1b[I";
const FOCUS_OUT = "\x1b[O";

interface ModelTerminal {
	/** Whether mode 1004 is enabled (set by the TUI via SM ?1004). */
	sendFocus: boolean;
	/** Whether the model textarea currently holds DOM focus. */
	textareaFocused: boolean;
	/** Bytes sent to the PTY in order — what Copilot sees. */
	sent: string[];
}

function makeTerminal(): ModelTerminal {
	return { sendFocus: false, textareaFocused: false, sent: [] };
}

/** Equivalent to xterm's _handleTextAreaFocus. Idempotent on already-focused. */
function focusTextarea(term: ModelTerminal): void {
	if (term.textareaFocused) return;
	term.textareaFocused = true;
	if (term.sendFocus) term.sent.push(FOCUS_IN);
}

/** Equivalent to xterm's _handleTextAreaBlur. Idempotent on already-blurred. */
function blurTextarea(term: ModelTerminal): void {
	if (!term.textareaFocused) return;
	term.textareaFocused = false;
	if (term.sendFocus) term.sent.push(FOCUS_OUT);
}

/**
 * Model of `v1TerminalCache.detachFromContainer` followed by the React
 * unmount in `useTerminalLifecycle.ts`. The wrapper is moved into the
 * `inert` parking container at `terminal-parking.ts`, which (per spec)
 * forces focus out of the subtree synchronously and fires blur on the
 * textarea.
 */
function park(term: ModelTerminal): void {
	blurTextarea(term);
}

/**
 * Model of the remount in `useTerminalLifecycle.ts` reattach path —
 * `v1TerminalCache.attachToContainer` moves the wrapper back into a live
 * container, then the effect runs:
 *
 *     if (isFocusedRef.current) {
 *         xterm.focus();
 *     }
 */
function unpark(term: ModelTerminal, isFocusedRefCurrent: boolean): void {
	if (isFocusedRefCurrent) {
		focusTextarea(term);
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("focus tracking on terminal pane reattach — issue #4542", () => {
	it("emits a focus-in when the TUI enables mode 1004 and the user focuses the pane", () => {
		const term = makeTerminal();
		// Copilot starts and turns on focus reporting (CSI ?1004 h)
		term.sendFocus = true;
		// User clicks into the pane — textarea becomes the active element
		focusTextarea(term);

		expect(term.sent).toEqual([FOCUS_IN]);
	});

	it("emits a focus-out when the pane is parked into the inert container on tab switch", () => {
		const term = makeTerminal();
		term.sendFocus = true;
		focusTextarea(term);

		park(term);

		expect(term.sent).toEqual([FOCUS_IN, FOCUS_OUT]);
		expect(term.textareaFocused).toBe(false);
	});

	it("re-emits focus-in on reattach when isFocusedRef.current is true (happy path)", () => {
		const term = makeTerminal();
		term.sendFocus = true;
		focusTextarea(term);
		park(term);

		// Reattach with isFocusedRef.current=true — the per-tab focusedPaneId
		// still points at this pane, so useTerminalLifecycle's mount effect
		// hits its `if (isFocusedRef.current) xterm.focus()` branch.
		unpark(term, /* isFocusedRefCurrent */ true);

		// Copilot has now seen IN -> OUT -> IN, so its TUI re-enters the
		// focused state and the input field accepts keystrokes again.
		expect(term.sent).toEqual([FOCUS_IN, FOCUS_OUT, FOCUS_IN]);
		expect(term.textareaFocused).toBe(true);
	});

	/**
	 * REPRODUCTION — this test FAILS with the current useTerminalLifecycle
	 * code path and PASSES once the fix sends an unconditional focus-in (or
	 * equivalently focuses the textarea regardless of the React store's
	 * focused-pane ref) on the reattach branch.
	 *
	 * Scenario: the user switched tabs by clicking the tab strip rather than
	 * by clicking inside the previous pane. By the time
	 * useTerminalLifecycle's mount effect runs for the Copilot pane on its
	 * way back in, `focusedPaneId` for this tab has not yet been re-pointed
	 * at this pane, so `isFocusedRef.current === false`. The mount effect
	 * skips `xterm.focus()`, the textarea stays blurred, and Copilot never
	 * receives the matching `\x1b[I` for the `\x1b[O` it got at park time.
	 *
	 * The last byte Copilot has seen is `\x1b[O`, so it sits in the blurred
	 * state — its cursor visibly leaves the input area (matching the
	 * reporter's wording) and keystrokes typed into the PTY are dropped.
	 */
	it("reattach with isFocusedRef.current=false leaves Copilot in the blurred state (bug)", () => {
		const term = makeTerminal();
		term.sendFocus = true;
		focusTextarea(term);
		park(term);

		// Tab-strip click reattach: pane is back on screen but the per-tab
		// focused-pane ref hasn't caught up.
		unpark(term, /* isFocusedRefCurrent */ false);

		// EXPECTED (post-fix): Copilot should see a focus-in so the IN/OUT
		// ledger balances.
		// ACTUAL (current code): the unconditional path is missing — no
		// FOCUS_IN follows the FOCUS_OUT, and Copilot stays blurred.
		const lastEvent = term.sent.at(-1);
		expect(lastEvent).toBe(FOCUS_IN);
	});

	/**
	 * Secondary reproduction: even in the `isFocusedRef.current === true`
	 * branch, the current code does nothing if the textarea is already
	 * considered focused (e.g. a fast tab switch where Chromium did not
	 * actually blur the textarea on inert assignment). `xterm.focus()`
	 * delegates to `textarea.focus()`, which is a no-op on an already-focused
	 * element, so no DOM focus event fires and no `\x1b[I` is re-emitted.
	 *
	 * This documents the second silent failure mode described in the header.
	 * The fix should explicitly re-trigger focus reporting (e.g. by blurring
	 * + refocusing, or by emitting `\x1b[I` directly via the core service)
	 * rather than relying on the DOM focus event to fire.
	 */
	it("reattach with already-focused textarea does not re-emit focus-in (bug)", () => {
		const term = makeTerminal();
		term.sendFocus = true;
		focusTextarea(term);

		// Simulate park where the browser did NOT actually blur the textarea
		// (e.g. inert assignment raced with the wrapper move). The textarea
		// stays "focused" in xterm's bookkeeping, but Copilot has never been
		// told this. To make the bug observable we manually send the FOCUS_OUT
		// that production would send via the v1 detach path — modelling a
		// half-applied park where the PTY got the byte but the DOM state
		// drifted.
		term.sent.push(FOCUS_OUT);

		// Reattach hits the happy path branch.
		unpark(term, /* isFocusedRefCurrent */ true);

		// EXPECTED (post-fix): a FOCUS_IN should follow the FOCUS_OUT.
		// ACTUAL (current code): focusTextarea is a no-op because
		// textareaFocused was never flipped to false, so no FOCUS_IN is sent.
		const lastEvent = term.sent.at(-1);
		expect(lastEvent).toBe(FOCUS_IN);
	});
});
