import { describe, expect, it } from "bun:test";
import {
	applyWorkspaceSelection,
	EMPTY_WORKSPACE_SELECTION,
	shouldClearWorkspaceSelectionOnEscape,
	workspaceSelectionModeFromModifiers,
} from "./workspaceSelection";

const orderedWorkspaceIds = ["one", "two", "three", "four", "five"];

describe("applyWorkspaceSelection", () => {
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

	it("preserves hidden selected workspaces when toggling a visible row", () => {
		expect(
			applyWorkspaceSelection(
				{
					projectId: "project-a",
					selectedIds: ["hidden", "three"],
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
			selectedIds: ["three", "five", "hidden"],
			anchorId: "five",
		});
	});

	it("preserves hidden selected workspaces when adding a visible range", () => {
		expect(
			applyWorkspaceSelection(
				{
					projectId: "project-a",
					selectedIds: ["hidden", "two"],
					anchorId: "two",
				},
				{
					workspaceId: "four",
					projectId: "project-a",
					orderedWorkspaceIds,
					mode: "add-range",
				},
			),
		).toEqual({
			projectId: "project-a",
			selectedIds: ["two", "three", "four", "hidden"],
			anchorId: "two",
		});
	});

	it("preserves a hidden anchor when starting a new additive visible range", () => {
		expect(
			applyWorkspaceSelection(
				{
					projectId: "project-a",
					selectedIds: ["hidden"],
					anchorId: "hidden",
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
			selectedIds: ["three", "hidden"],
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
