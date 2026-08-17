import { expect, test } from "bun:test";
import { useV2WorkspacesFilterStore } from "./v2WorkspacesFilterStore";

test("defaults workspaces to the board with archived workspaces hidden", () => {
	const state = useV2WorkspacesFilterStore.getState();

	expect(state.viewMode).toBe("board");
	expect(state.archivedWindow).toBe("none");
});
