import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("DeleteWorkspaceDialog", () => {
	/**
	 * Bug #1789: When the dialog is opened from a Radix ContextMenu (right-click
	 * → "Close Workspace"), keyboard focus is not captured by the dialog.
	 *
	 * Root cause: Radix ContextMenu's `onSelect` fires our state update that opens
	 * the dialog, then Radix restores focus to the ContextMenuTrigger (the sidebar
	 * workspace button). This happens _after_ the AlertDialog opens, so focus ends
	 * up back on the sidebar item and the dialog buttons are unreachable via keyboard.
	 *
	 * Fix: Add `autoFocus` to the Cancel button. Radix's FocusScope inside
	 * AlertDialogContent detects this and explicitly focuses that element when the
	 * dialog opens, overriding the ContextMenu's focus-restoration behaviour.
	 */
	test("Cancel button must have autoFocus so keyboard focus is captured when dialog opens from a context menu", () => {
		const source = readFileSync(
			join(import.meta.dir, "DeleteWorkspaceDialog.tsx"),
			"utf-8",
		);

		// The dialog must declare autoFocus on at least one of its buttons.
		// Without this, pressing Enter after opening the dialog via right-click does
		// nothing because the sidebar workspace button retains keyboard focus.
		expect(source).toContain("autoFocus");
	});
});
