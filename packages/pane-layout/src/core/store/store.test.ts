import { describe, expect, it } from "bun:test";
import {
	createPaneRoot,
	createPaneWorkspaceState,
	createPaneWorkspaceStore,
} from "./store";
import type { PaneState, PersistedPaneWorkspaceState } from "../../types";

interface TestPaneData {
	label: string;
}

function createTestPane(id: string, label = id): PaneState<TestPaneData> {
	return {
		id,
		kind: "test",
		data: { label },
	};
}

describe("pane workspace state operations", () => {
	it("splits a group and adds a sibling group", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialPersistedState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-main",
						groupId: "group-root",
						panes: [createTestPane("pane-a", "A")],
					}),
				],
			}),
		});

		store.getState().splitGroup({
			rootId: "root-main",
			groupId: "group-root",
			position: "right",
			newGroupId: "group-right",
			newPane: createTestPane("pane-b", "B"),
		});

		const nextState = store.getState().persisted;

		const root = nextState.roots[0]!;
		expect(root.root.type).toBe("split");
		expect(root.activeGroupId).toBe("group-right");

		const splitNode = root.root.type === "split" ? root.root : null;
		expect(splitNode?.children[1]).toMatchObject({
			type: "group",
			id: "group-right",
			activePaneId: "pane-b",
		});
	});

	it("moves a pane across roots", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialPersistedState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-source",
						groupId: "group-source",
						panes: [createTestPane("pane-a", "A")],
					}),
					createPaneRoot({
						id: "root-target",
						groupId: "group-target",
						panes: [createTestPane("pane-b", "B")],
					}),
				],
				activeRootId: "root-source",
			}),
		});

		store.getState().movePane({
			paneId: "pane-a",
			targetRootId: "root-target",
			targetGroupId: "group-target",
			select: true,
		});

		const nextState = store.getState().persisted;

		const sourceGroup =
			nextState.roots[0]!.root.type === "group" ? nextState.roots[0]!.root : null;
		const targetGroup =
			nextState.roots[1]!.root.type === "group" ? nextState.roots[1]!.root : null;

		expect(sourceGroup?.panes).toEqual([]);
		expect(targetGroup?.panes.map((pane) => pane.id)).toEqual(["pane-b", "pane-a"]);
		expect(targetGroup?.activePaneId).toBe("pane-a");
		expect(nextState.activeRootId).toBe("root-target");
	});

	it("adds a pane to a group at a specific index", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialPersistedState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-main",
						groupId: "group-root",
						panes: [createTestPane("pane-a"), createTestPane("pane-c")],
					}),
				],
			}),
		});

		store.getState().addPaneToGroup({
			rootId: "root-main",
			groupId: "group-root",
			pane: createTestPane("pane-b"),
			index: 1,
		});

		const nextState = store.getState().persisted;

		const group = nextState.roots[0]!.root.type === "group" ? nextState.roots[0]!.root : null;
		expect(group?.panes.map((pane) => pane.id)).toEqual(["pane-a", "pane-b", "pane-c"]);
	});

	it("closes the active pane and selects the next available pane", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialPersistedState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-main",
						groupId: "group-root",
						panes: [createTestPane("pane-a"), createTestPane("pane-b")],
						activePaneId: "pane-a",
					}),
				],
			}),
		});

		store.getState().closePane({
			rootId: "root-main",
			groupId: "group-root",
			paneId: "pane-a",
		});

		const nextState = store.getState().persisted;

		const group = nextState.roots[0]!.root.type === "group" ? nextState.roots[0]!.root : null;
		expect(group?.panes.map((pane) => pane.id)).toEqual(["pane-b"]);
		expect(group?.activePaneId).toBe("pane-b");
	});

	it("updates active pane without going through a reducer action union", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialPersistedState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-main",
						groupId: "group-root",
						panes: [createTestPane("pane-a"), createTestPane("pane-b")],
					}),
				],
			}),
		});

		store.getState().setActivePane({
			rootId: "root-main",
			groupId: "group-root",
			paneId: "pane-b",
		});

		const nextState = store.getState().persisted;

		const group = nextState.roots[0]!.root.type === "group" ? nextState.roots[0]!.root : null;
		expect(group?.activePaneId).toBe("pane-b");
	});
});

describe("createPaneWorkspaceStore", () => {
	it("wraps the pure operations in ergonomic Zustand methods", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialPersistedState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-main",
						groupId: "group-root",
						panes: [createTestPane("pane-a"), createTestPane("pane-b")],
					}),
				],
			}),
		});

		store.getState().setActivePane({
			rootId: "root-main",
			groupId: "group-root",
			paneId: "pane-b",
		});

		const root = store.getState().persisted.roots[0]!;
		const group = root.root.type === "group" ? root.root : null;
		expect(store.getState().persisted.activeRootId).toBe("root-main");
		expect(root.activeGroupId).toBe("group-root");
		expect(group?.activePaneId).toBe("pane-b");
	});

	it("supports direct persisted-state replacement", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialPersistedState: createPaneWorkspaceState({
				roots: [],
			}),
		});

		store.getState().setPersistedState((prev: PersistedPaneWorkspaceState<TestPaneData>) => ({
			...prev,
			activeRootId: "root-created",
		}));

		expect(store.getState().persisted.activeRootId).toBe("root-created");
	});
});
