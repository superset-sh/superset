import { describe, expect, test } from "bun:test";

/**
 * Reproduces GitHub issue #1790:
 * When selecting "Close Worktree" from the workspace context menu,
 * keyboard focus is not trapped inside the resulting dialog. The workspace
 * sidebar button (the ContextMenu trigger) retains focus instead of the dialog
 * buttons, making it impossible to close the workspace with the keyboard.
 *
 * Root cause: the ContextMenuItem's onSelect handler calls onDeleteClick()
 * synchronously, which immediately sets showDeleteDialog = true. Radix UI's
 * ContextMenuContent then fires onCloseAutoFocus to restore focus to the
 * ContextMenuTrigger (the workspace button). Since the dialog's AlertDialogContent
 * FocusScope sets initial focus during the same React render cycle, the
 * ContextMenu's focus restoration can win the race and steal focus from the dialog.
 *
 * Fix: Opening the dialog must be deferred (e.g. via setTimeout) so that the
 * ContextMenu fully closes and restores focus before the AlertDialog mounts
 * its FocusScope and traps keyboard focus.
 */
describe("DeleteWorkspaceDialog - keyboard focus trap when opened from ContextMenu (#1790)", () => {
	/**
	 * Models the Radix UI ContextMenu event sequence:
	 *
	 *   1. User right-clicks workspace → ContextMenu opens
	 *   2. User clicks "Close Worktree" → ContextMenuItem.onSelect fires (synchronous)
	 *   3. ContextMenu closes → ContextMenuContent.onCloseAutoFocus fires
	 *      → focus returns to the ContextMenuTrigger (workspace sidebar button)
	 *
	 * For the AlertDialog's FocusScope to trap focus, the dialog MUST open
	 * after step 3, not during step 2. Otherwise step 3 steals focus away.
	 */
	test("dialog opening must be deferred until after ContextMenu restores focus", () => {
		const timeline: string[] = [];

		// Simulate Radix UI ContextMenu's event dispatch:
		// onSelect fires synchronously, then onCloseAutoFocus fires after.
		function simulateContextMenuSelect(
			onSelect: () => void,
			onCloseAutoFocus?: (e: { preventDefault: () => void }) => void,
		) {
			onSelect(); // fires synchronously during user click
			// After onSelect the menu dismisses and Radix restores focus to trigger
			timeline.push("contextmenu:close-auto-focus");
			onCloseAutoFocus?.({ preventDefault: () => {} });
		}

		// ── Current (buggy) implementation ───────────────────────────────────
		// CollapsedWorkspaceItem uses:
		//   <ContextMenuItem onSelect={() => onDeleteClick()}>
		// and useWorkspaceDeleteHandler defines:
		//   const handleDeleteClick = () => { setShowDeleteDialog(true); }
		// Both are fully synchronous, so the dialog opens during step 2.

		simulateContextMenuSelect(() => {
			// handleDeleteClick() → setShowDeleteDialog(true) synchronously
			timeline.push("dialog:open-requested");
		});

		// With the bug the timeline is:
		//   ["dialog:open-requested", "contextmenu:close-auto-focus"]
		// ContextMenu's focus-restoration fires AFTER the dialog has already
		// requested to open, so it can steal focus from the dialog's FocusScope.
		//
		// The fix (defer via setTimeout in handleDeleteClick) would produce:
		//   ["contextmenu:close-auto-focus", "dialog:open-requested"]
		// so that AlertDialog's FocusScope activates with no competition.
		expect(timeline).toEqual([
			"contextmenu:close-auto-focus", // focus restored first …
			"dialog:open-requested", //        … then dialog opens safely
		]);
		// ↑ This assertion FAILS with the current synchronous implementation,
		//   proving the keyboard-focus bug described in issue #1790.
	});

	/**
	 * Cross-checks the fix boundary: immediately after calling handleDeleteClick
	 * (as currently implemented), the dialog must NOT yet be marked open.
	 * If it is already open at that point the ContextMenu focus-restoration
	 * that follows will be able to steal focus.
	 */
	test("handleDeleteClick must not set showDeleteDialog synchronously", () => {
		let showDeleteDialog = false;

		// Current implementation in useWorkspaceDeleteHandler:
		//   const handleDeleteClick = (e?) => { e?.stopPropagation(); setShowDeleteDialog(true); }
		const handleDeleteClickCurrent = () => {
			showDeleteDialog = true; // synchronous — this is the bug
		};

		// Simulate ContextMenuItem.onSelect calling handleDeleteClick
		handleDeleteClickCurrent();

		// FAILS: showDeleteDialog is already true synchronously.
		// The value must remain false here; it should only become true after
		// the current event-loop tick (i.e. inside a setTimeout callback),
		// so that ContextMenu's onCloseAutoFocus fires before the dialog opens.
		expect(showDeleteDialog).toBe(false);
	});
});
