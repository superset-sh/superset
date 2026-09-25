import { describe, expect, it } from "bun:test";
import { resolveWorkspaceRowContextMenu } from "./workspaceRowContextMenu";

describe("resolveWorkspaceRowContextMenu", () => {
	it("uses the bulk menu on a selected row within a multi-selection", () => {
		expect(
			resolveWorkspaceRowContextMenu({
				canBulkSelect: true,
				isSelected: true,
				selectionCount: 3,
			}),
		).toEqual({ menu: "bulk" });
	});

	it("keeps the single menu for a lone selected row", () => {
		expect(
			resolveWorkspaceRowContextMenu({
				canBulkSelect: true,
				isSelected: true,
				selectionCount: 1,
			}),
		).toEqual({ menu: "single", clearSelectionFirst: false });
	});

	it("clears a selection when right-clicking outside it", () => {
		expect(
			resolveWorkspaceRowContextMenu({
				canBulkSelect: true,
				isSelected: false,
				selectionCount: 2,
			}),
		).toEqual({ menu: "single", clearSelectionFirst: true });
	});

	it("clears a selection from non-selectable rows too", () => {
		expect(
			resolveWorkspaceRowContextMenu({
				canBulkSelect: false,
				isSelected: false,
				selectionCount: 2,
			}),
		).toEqual({ menu: "single", clearSelectionFirst: true });
	});

	it("stays single with no selection active", () => {
		expect(
			resolveWorkspaceRowContextMenu({
				canBulkSelect: true,
				isSelected: false,
				selectionCount: 0,
			}),
		).toEqual({ menu: "single", clearSelectionFirst: false });
	});
});
