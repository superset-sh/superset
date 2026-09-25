import { expect, test } from "bun:test";
import { useWorkspacesFilterStore } from "./workspacesFilterStore";

test("defaults workspaces to the board with archived workspaces hidden", () => {
	const state = useWorkspacesFilterStore.getState();

	expect(state.viewMode).toBe("board");
	expect(state.archivedWindow).toBe("none");
});

test("reset preserves the chosen view and hides archived workspaces", () => {
	useWorkspacesFilterStore.setState({
		viewMode: "list",
		archivedWindow: "week",
	});

	useWorkspacesFilterStore.getState().reset();

	const state = useWorkspacesFilterStore.getState();
	expect(state.viewMode).toBe("list");
	expect(state.archivedWindow).toBe("none");
});

test("toggleLane hides a lane and toggles it back", () => {
	useWorkspacesFilterStore.setState({ hiddenLanes: [] });

	useWorkspacesFilterStore.getState().toggleLane("attention");
	expect(useWorkspacesFilterStore.getState().hiddenLanes).toEqual([
		"attention",
	]);

	useWorkspacesFilterStore.getState().toggleLane("merged");
	expect(useWorkspacesFilterStore.getState().hiddenLanes).toEqual([
		"attention",
		"merged",
	]);

	useWorkspacesFilterStore.getState().toggleLane("attention");
	expect(useWorkspacesFilterStore.getState().hiddenLanes).toEqual(["merged"]);
});

test("reset restores all hidden lanes", () => {
	useWorkspacesFilterStore.setState({ hiddenLanes: ["merged", "deleted"] });

	useWorkspacesFilterStore.getState().reset();

	expect(useWorkspacesFilterStore.getState().hiddenLanes).toEqual([]);
});
