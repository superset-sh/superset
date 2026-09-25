import { describe, expect, it } from "bun:test";
import {
	applyWorkspaceSelection,
	EMPTY_WORKSPACE_SELECTION,
	shouldClearWorkspaceSelectionOnEscape,
	workspaceSelectionModeFromModifiers,
} from "./workspaceSelection";

const orderedWorkspaceIds = ["one", "two", "three", "four", "five"];

describe("applyWorkspaceSelection", () => {
	it("includes the active workspace on the first additive click", () => {
		expect(
			applyWorkspaceSelection(EMPTY_WORKSPACE_SELECTION, {
				workspaceId: "four",
				projectId: "project-a",
				orderedWorkspaceIds,
				mode: "toggle",
				activeWorkspaceId: "two",
			}),
		).toEqual({
			projectId: "project-a",
			selectedIds: ["two", "four"],
			anchorId: "four",
		});
	});

	it("uses the active workspace as the first range anchor", () => {
		expect(
			applyWorkspaceSelection(EMPTY_WORKSPACE_SELECTION, {
				workspaceId: "five",
				projectId: "sessions",
				orderedWorkspaceIds,
				mode: "range",
				activeWorkspaceId: "two",
			}),
		).toEqual({
			projectId: "sessions",
			selectedIds: ["two", "three", "four", "five"],
			anchorId: "two",
		});
	});

	it("ignores an active workspace outside the clicked lane", () => {
		expect(
			applyWorkspaceSelection(EMPTY_WORKSPACE_SELECTION, {
				workspaceId: "three",
				projectId: "project-a",
				orderedWorkspaceIds,
				mode: "toggle",
				activeWorkspaceId: "different-project-workspace",
			}),
		).toEqual({
			projectId: "project-a",
			selectedIds: ["three"],
			anchorId: "three",
		});
	});

	it("starts a project-scoped selection", () => {
		expect(
			applyWorkspaceSelection(EMPTY_WORKSPACE_SELECTION, {
				workspaceId: "two",
				projectId: "project-a",
				orderedWorkspaceIds,
				mode: "toggle",
			}),
		).toEqual({
			projectId: "project-a",
			selectedIds: ["two"],
			anchorId: "two",
		});
	});

	it("toggles individual workspaces and preserves visual order", () => {
		const initial = {
			projectId: "project-a",
			selectedIds: ["four"],
			anchorId: "four",
		};

		expect(
			applyWorkspaceSelection(initial, {
				workspaceId: "two",
				projectId: "project-a",
				orderedWorkspaceIds,
				mode: "toggle",
			}),
		).toEqual({
			projectId: "project-a",
			selectedIds: ["two", "four"],
			anchorId: "two",
		});
	});

	it("clears the selection after toggling off the final workspace", () => {
		expect(
			applyWorkspaceSelection(
				{
					projectId: "project-a",
					selectedIds: ["two"],
					anchorId: "two",
				},
				{
					workspaceId: "two",
					projectId: "project-a",
					orderedWorkspaceIds,
					mode: "toggle",
				},
			),
		).toEqual(EMPTY_WORKSPACE_SELECTION);
	});

	it("selects a contiguous visible range from the anchor", () => {
		expect(
			applyWorkspaceSelection(
				{
					projectId: "project-a",
					selectedIds: ["two"],
					anchorId: "two",
				},
				{
					workspaceId: "four",
					projectId: "project-a",
					orderedWorkspaceIds,
					mode: "range",
				},
			),
		).toEqual({
			projectId: "project-a",
			selectedIds: ["two", "three", "four"],
			anchorId: "two",
		});
	});

	it("adds a range to an existing modifier selection", () => {
		expect(
			applyWorkspaceSelection(
				{
					projectId: "project-a",
					selectedIds: ["one", "three"],
					anchorId: "three",
				},
				{
					workspaceId: "five",
					projectId: "project-a",
					orderedWorkspaceIds,
					mode: "add-range",
				},
			),
		).toEqual({
			projectId: "project-a",
			selectedIds: ["one", "three", "four", "five"],
			anchorId: "three",
		});
	});

	it("starts over when selection moves to another project", () => {
		expect(
			applyWorkspaceSelection(
				{
					projectId: "project-a",
					selectedIds: ["one", "two"],
					anchorId: "one",
				},
				{
					workspaceId: "four",
					projectId: "project-b",
					orderedWorkspaceIds,
					mode: "toggle",
				},
			),
		).toEqual({
			projectId: "project-b",
			selectedIds: ["four"],
			anchorId: "four",
		});
	});

	it("drops stale ids missing from the ordered list", () => {
		// The provider prunes ids whose rows leave the sidebar (deleted, pinned,
		// group collapsed); any straggler that races a click is dropped rather
		// than carried along invisibly.
		expect(
			applyWorkspaceSelection(
				{
					projectId: "project-a",
					selectedIds: ["stale", "three"],
					anchorId: "three",
				},
				{
					workspaceId: "five",
					projectId: "project-a",
					orderedWorkspaceIds,
					mode: "toggle",
				},
			),
		).toEqual({
			projectId: "project-a",
			selectedIds: ["three", "five"],
			anchorId: "five",
		});
	});

	it("re-anchors an additive click when the anchor is no longer listed", () => {
		expect(
			applyWorkspaceSelection(
				{
					projectId: "project-a",
					selectedIds: ["stale"],
					anchorId: "stale",
				},
				{
					workspaceId: "three",
					projectId: "project-a",
					orderedWorkspaceIds,
					mode: "add-range",
				},
			),
		).toEqual({
			projectId: "project-a",
			selectedIds: ["three"],
			anchorId: "three",
		});
	});
});

describe("workspaceSelectionModeFromModifiers", () => {
	it("maps Command and Control to toggle selection", () => {
		expect(
			workspaceSelectionModeFromModifiers({
				ctrlKey: false,
				metaKey: true,
				shiftKey: false,
			}),
		).toBe("toggle");
		expect(
			workspaceSelectionModeFromModifiers({
				ctrlKey: true,
				metaKey: false,
				shiftKey: false,
			}),
		).toBe("toggle");
	});

	it("maps Shift and additive Shift to range selection", () => {
		expect(
			workspaceSelectionModeFromModifiers({
				ctrlKey: false,
				metaKey: false,
				shiftKey: true,
			}),
		).toBe("range");
		expect(
			workspaceSelectionModeFromModifiers({
				ctrlKey: true,
				metaKey: false,
				shiftKey: true,
			}),
		).toBe("add-range");
	});

	it("keeps plain clicks available for navigation", () => {
		expect(
			workspaceSelectionModeFromModifiers({
				ctrlKey: false,
				metaKey: false,
				shiftKey: false,
			}),
		).toBeNull();
	});
});

describe("shouldClearWorkspaceSelectionOnEscape", () => {
	it("clears on an unhandled Escape from the sidebar", () => {
		expect(
			shouldClearWorkspaceSelectionOnEscape({
				key: "Escape",
				defaultPrevented: false,
				fromTransientSurface: false,
			}),
		).toBeTrue();
	});

	it("lets menus and dialogs consume the first Escape", () => {
		expect(
			shouldClearWorkspaceSelectionOnEscape({
				key: "Escape",
				defaultPrevented: false,
				fromTransientSurface: true,
			}),
		).toBeFalse();
		expect(
			shouldClearWorkspaceSelectionOnEscape({
				key: "Escape",
				defaultPrevented: true,
				fromTransientSurface: false,
			}),
		).toBeFalse();
	});
});
