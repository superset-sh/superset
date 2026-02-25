import { describe, expect, test } from "bun:test";
import {
	createContextMenuDeleteDialogCoordinator,
	deferDeleteDialogOpen,
} from "renderer/react-query/workspaces/useWorkspaceDeleteHandler";
import { focusPrimaryDialogAction } from "./focus-primary-dialog-action";

/**
 * Reproduces GitHub issue #1790:
 * When selecting "Close Worktree" from the workspace context menu,
 * keyboard focus is not trapped inside the resulting dialog. The workspace
 * sidebar button (the ContextMenu trigger) retains focus instead of the dialog
 * buttons, making it impossible to close the workspace with the keyboard.
 *
 * Root cause: the ContextMenuItem's onSelect handler used to call onDeleteClick()
 * synchronously, which immediately set showDeleteDialog = true. Radix UI's
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
	 *   1. User right-clicks workspace -> ContextMenu opens
	 *   2. User clicks "Close Worktree" -> ContextMenuItem.onSelect fires (synchronous)
	 *   3. ContextMenu closes -> ContextMenuContent.onCloseAutoFocus fires
	 *      -> focus returns to the ContextMenuTrigger (workspace sidebar button)
	 *
	 * For the AlertDialog's FocusScope to trap focus, the dialog MUST open
	 * after step 3, not during step 2. Otherwise step 3 steals focus away.
	 */
	test("dialog opening must be deferred until after ContextMenu restores focus", async () => {
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

		// CollapsedWorkspaceItem uses:
		//   <ContextMenuItem onSelect={() => onDeleteClick()}>
		// useWorkspaceDeleteHandler must defer opening until after auto-focus restore.

		simulateContextMenuSelect(() => {
			deferDeleteDialogOpen(() => {
				timeline.push("dialog:open-requested");
			});
		});

		expect(timeline).toEqual(["contextmenu:close-auto-focus"]);

		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(timeline).toEqual([
			"contextmenu:close-auto-focus",
			"dialog:open-requested",
		]);
	});

	/**
	 * Cross-checks the fix boundary: immediately after calling handleDeleteClick
	 * (as currently implemented), the dialog must NOT yet be marked open.
	 * If it is already open at that point the ContextMenu focus-restoration
	 * that follows will be able to steal focus.
	 */
	test("handleDeleteClick must not set showDeleteDialog synchronously", async () => {
		let showDeleteDialog = false;

		deferDeleteDialogOpen((show) => {
			showDeleteDialog = show;
		});

		expect(showDeleteDialog).toBe(false);

		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(showDeleteDialog).toBe(true);
	});

	test("close menu auto-focus is prevented before opening delete dialog", () => {
		const timeline: string[] = [];
		const coordinator = createContextMenuDeleteDialogCoordinator(() => {
			timeline.push("dialog:open-requested");
		});

		coordinator.requestOpenDeleteDialog();
		coordinator.handleCloseAutoFocus({
			preventDefault: () => {
				timeline.push("contextmenu:prevent-default-auto-focus");
			},
		});

		expect(timeline).toEqual([
			"contextmenu:prevent-default-auto-focus",
			"dialog:open-requested",
		]);
	});

	test("close menu auto-focus does nothing when delete was not requested", () => {
		let prevented = false;
		let opened = false;
		const coordinator = createContextMenuDeleteDialogCoordinator(() => {
			opened = true;
		});

		coordinator.handleCloseAutoFocus({
			preventDefault: () => {
				prevented = true;
			},
		});

		expect(prevented).toBe(false);
		expect(opened).toBe(false);
	});

	test("close menu auto-focus opens at most once per request", () => {
		let openCalls = 0;
		const coordinator = createContextMenuDeleteDialogCoordinator(() => {
			openCalls += 1;
		});

		coordinator.requestOpenDeleteDialog();
		coordinator.requestOpenDeleteDialog();

		coordinator.handleCloseAutoFocus({
			preventDefault: () => {},
		});
		coordinator.handleCloseAutoFocus({
			preventDefault: () => {},
		});

		expect(openCalls).toBe(1);
	});

	test("dialog open autofocus focuses actionable close button", () => {
		let prevented = false;
		let focused = false;

		focusPrimaryDialogAction(
			{
				preventDefault: () => {
					prevented = true;
				},
			},
			{
				focus: () => {
					focused = true;
				},
			},
		);

		expect(prevented).toBe(true);
		expect(focused).toBe(true);
	});

	test("dialog open autofocus still prevents default when target is null", () => {
		let prevented = false;

		focusPrimaryDialogAction(
			{
				preventDefault: () => {
					prevented = true;
				},
			},
			null,
		);

		expect(prevented).toBe(true);
	});
});
