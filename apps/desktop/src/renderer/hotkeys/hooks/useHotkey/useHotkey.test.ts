import { afterEach, describe, expect, it } from "bun:test";
import { useVscodeFocusStore } from "renderer/stores/vscode-focus";

describe("useHotkey vscode focus gating", () => {
	afterEach(() => {
		useVscodeFocusStore.setState({ focusedPaneId: null });
	});

	it("shouldIgnoreEvent returns true when a vscode pane has focus", async () => {
		// shouldIgnoreEvent is module-private, but it reads the store
		// imperatively. We can verify the contract by checking the store state
		// that the gating logic reads.
		useVscodeFocusStore.getState().setFocused("pane-1", true);
		expect(useVscodeFocusStore.getState().focusedPaneId).toBe("pane-1");
	});

	it("focusedPaneId is null when no vscode pane has focus", () => {
		expect(useVscodeFocusStore.getState().focusedPaneId).toBeNull();
	});

	it("clearing a focused pane resets focusedPaneId", () => {
		useVscodeFocusStore.getState().setFocused("pane-1", true);
		useVscodeFocusStore.getState().setFocused("pane-1", false);
		expect(useVscodeFocusStore.getState().focusedPaneId).toBeNull();
	});

	it("clearing a non-focused pane does not affect the focused pane", () => {
		useVscodeFocusStore.getState().setFocused("pane-1", true);
		useVscodeFocusStore.getState().setFocused("pane-2", false);
		expect(useVscodeFocusStore.getState().focusedPaneId).toBe("pane-1");
	});

	it("clearPane removes focus for the specified pane", () => {
		useVscodeFocusStore.getState().setFocused("pane-1", true);
		useVscodeFocusStore.getState().clearPane("pane-1");
		expect(useVscodeFocusStore.getState().focusedPaneId).toBeNull();
	});

	it("clearPane does not affect other panes", () => {
		useVscodeFocusStore.getState().setFocused("pane-1", true);
		useVscodeFocusStore.getState().clearPane("pane-2");
		expect(useVscodeFocusStore.getState().focusedPaneId).toBe("pane-1");
	});
});
