import { describe, expect, test } from "bun:test";
import { createContextMenuDeleteDialogCoordinator } from "renderer/react-query/workspaces/useWorkspaceDeleteHandler";

describe("WorkspaceContextMenu - delete/close option (#2741)", () => {
	test("coordinator calls onDelete when close auto-focus fires after request", () => {
		let deleteCalled = false;
		const coordinator = createContextMenuDeleteDialogCoordinator(() => {
			deleteCalled = true;
		});

		coordinator.requestOpenDeleteDialog();

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
		coordinator.handleCloseAutoFocus({ preventDefault: () => {} });

		expect(callCount).toBe(1);
	});
});
