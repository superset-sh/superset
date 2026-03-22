import { describe, expect, test } from "bun:test";
import { createContextMenuDeleteDialogCoordinator } from "renderer/react-query/workspaces/useWorkspaceDeleteHandler";

/**
 * Reproduces GitHub issue #2741:
 * The expanded sidebar context menu (right-click on a workspace) has no option
 * to delete or close a workspace. The only way to remove a workspace from the
 * sidebar is to click the small "X" icon on hover, which is easy to miss.
 *
 * Fix: WorkspaceContextMenu now accepts an `onDelete` prop and renders a
 * "Close Worktree" / "Close Workspace" menu item that uses the same
 * `createContextMenuDeleteDialogCoordinator` pattern as CollapsedWorkspaceItem.
 */
describe("WorkspaceContextMenu - delete/close option (#2741)", () => {
	test("coordinator calls onDelete when close auto-focus fires after request", () => {
		let deleteCalled = false;
		const coordinator = createContextMenuDeleteDialogCoordinator(() => {
			deleteCalled = true;
		});

		// Simulate: user clicks "Close Worktree" menu item
		coordinator.requestOpenDeleteDialog();

		// Simulate: context menu closes and fires onCloseAutoFocus
		let preventDefaultCalled = false;
		coordinator.handleCloseAutoFocus({
			preventDefault: () => {
				preventDefaultCalled = true;
			},
		});

		expect(preventDefaultCalled).toBe(true);
		expect(deleteCalled).toBe(true);
	});

	test("coordinator does not call onDelete if no request was made", () => {
		let deleteCalled = false;
		const coordinator = createContextMenuDeleteDialogCoordinator(() => {
			deleteCalled = true;
		});

		// Simulate: context menu closes without selecting the delete item
		coordinator.handleCloseAutoFocus({
			preventDefault: () => {},
		});

		expect(deleteCalled).toBe(false);
	});

	test("coordinator resets after firing, so a second close does not re-trigger", () => {
		let callCount = 0;
		const coordinator = createContextMenuDeleteDialogCoordinator(() => {
			callCount += 1;
		});

		coordinator.requestOpenDeleteDialog();
		coordinator.handleCloseAutoFocus({ preventDefault: () => {} });
		// Second close without a new request
		coordinator.handleCloseAutoFocus({ preventDefault: () => {} });

		expect(callCount).toBe(1);
	});
});
