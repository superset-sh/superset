import { beforeEach, describe, expect, it } from "bun:test";
import { useDragPaneStore } from "./drag-pane-store";

beforeEach(() => {
	useDragPaneStore.setState({
		draggingPaneId: null,
		draggingSourceTabId: null,
		isResizing: false,
	});
});

describe("drag-pane-store", () => {
	describe("drag state", () => {
		it("starts with no dragging pane", () => {
			expect(useDragPaneStore.getState().draggingPaneId).toBeNull();
		});

		it("sets dragging pane and tab", () => {
			useDragPaneStore.getState().setDragging("pane-1", "tab-1");
			const state = useDragPaneStore.getState();
			expect(state.draggingPaneId).toBe("pane-1");
			expect(state.draggingSourceTabId).toBe("tab-1");
		});

		it("clears dragging state", () => {
			useDragPaneStore.getState().setDragging("pane-1", "tab-1");
			useDragPaneStore.getState().clearDragging();
			const state = useDragPaneStore.getState();
			expect(state.draggingPaneId).toBeNull();
			expect(state.draggingSourceTabId).toBeNull();
		});
	});

	describe("isResizing state", () => {
		// Regression: https://github.com/superset-sh/superset/issues/2035

		it("starts as false", () => {
			expect(useDragPaneStore.getState().isResizing).toBe(false);
		});

		it("setResizing(true) activates resizing mode", () => {
			useDragPaneStore.getState().setResizing(true);
			expect(useDragPaneStore.getState().isResizing).toBe(true);
		});

		it("setResizing(false) deactivates resizing mode", () => {
			useDragPaneStore.getState().setResizing(true);
			useDragPaneStore.getState().setResizing(false);
			expect(useDragPaneStore.getState().isResizing).toBe(false);
		});

		it("isResizing is independent from isDragging", () => {
			useDragPaneStore.getState().setDragging("pane-1", "tab-1");
			expect(useDragPaneStore.getState().isResizing).toBe(false);

			useDragPaneStore.getState().setResizing(true);
			expect(useDragPaneStore.getState().draggingPaneId).toBe("pane-1");
			expect(useDragPaneStore.getState().isResizing).toBe(true);
		});

		it("clearing drag does not affect isResizing", () => {
			useDragPaneStore.getState().setResizing(true);
			useDragPaneStore.getState().setDragging("pane-1", "tab-1");
			useDragPaneStore.getState().clearDragging();

			expect(useDragPaneStore.getState().isResizing).toBe(true);
		});
	});
});
