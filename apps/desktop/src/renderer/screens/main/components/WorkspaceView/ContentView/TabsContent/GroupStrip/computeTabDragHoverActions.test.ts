import { describe, expect, it } from "bun:test";
import { computeTabDragHoverActions } from "./computeTabDragHoverActions";

describe("computeTabDragHoverActions", () => {
	// Regression for https://github.com/superset-sh/superset/issues/4958:
	// Without spring-loaded activation, the hovered tab never becomes active,
	// so its split drop zones never render and the user can't drop a tab to
	// merge layouts.
	it("activates the hovered tab when dragging a different, inactive tab onto it", () => {
		const actions = computeTabDragHoverActions({
			itemTabId: "tab-b",
			itemIndex: 1,
			hoveredTabId: "tab-a",
			hoveredIndex: 0,
			isHoveredActive: false,
		});

		expect(actions.activate).toBe(true);
	});

	it("does not activate when hovering the dragged tab over itself", () => {
		const actions = computeTabDragHoverActions({
			itemTabId: "tab-b",
			itemIndex: 1,
			hoveredTabId: "tab-b",
			hoveredIndex: 1,
			isHoveredActive: false,
		});

		expect(actions.activate).toBe(false);
	});

	it("does not re-activate an already-active tab", () => {
		const actions = computeTabDragHoverActions({
			itemTabId: "tab-b",
			itemIndex: 1,
			hoveredTabId: "tab-a",
			hoveredIndex: 0,
			isHoveredActive: true,
		});

		expect(actions.activate).toBe(false);
	});

	it("returns reorder action when dragged index differs from hovered index", () => {
		const actions = computeTabDragHoverActions({
			itemTabId: "tab-b",
			itemIndex: 1,
			hoveredTabId: "tab-a",
			hoveredIndex: 0,
			isHoveredActive: false,
		});

		expect(actions.reorder).toEqual({ fromIndex: 1, toIndex: 0 });
	});

	it("omits reorder when indices match", () => {
		const actions = computeTabDragHoverActions({
			itemTabId: "tab-b",
			itemIndex: 1,
			hoveredTabId: "tab-a",
			hoveredIndex: 1,
			isHoveredActive: false,
		});

		expect(actions.reorder).toBeUndefined();
	});

	it("omits reorder when itemIndex is undefined", () => {
		const actions = computeTabDragHoverActions({
			itemTabId: "tab-b",
			itemIndex: undefined,
			hoveredTabId: "tab-a",
			hoveredIndex: 0,
			isHoveredActive: false,
		});

		expect(actions.reorder).toBeUndefined();
	});
});
