import { expect, test } from "bun:test";
import { useV2WorkspacesFilterStore } from "./v2WorkspacesFilterStore";

test("defaults workspaces to the board with archived workspaces hidden", () => {
	const state = useV2WorkspacesFilterStore.getState();

	expect(state.viewMode).toBe("board");
	expect(state.archivedWindow).toBe("none");
});

test("reset preserves the chosen view and hides archived workspaces", () => {
	useV2WorkspacesFilterStore.setState({
		viewMode: "list",
		archivedWindow: "week",
	});

	useV2WorkspacesFilterStore.getState().reset();

	const state = useV2WorkspacesFilterStore.getState();
	expect(state.viewMode).toBe("list");
	expect(state.archivedWindow).toBe("none");
});
