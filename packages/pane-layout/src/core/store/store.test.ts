import { describe, expect, it } from "bun:test";
import type { PaneState, PaneWorkspaceState } from "../../types";
import {
	createPaneRoot,
	createPaneWorkspaceState,
	createPaneWorkspaceStore,
} from "./store";

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

function getFirstRoot(state: PaneWorkspaceState<TestPaneData>) {
	const root = state.roots[0];
	if (!root) {
		throw new Error("Expected first root");
	}
	return root;
}

describe("pane workspace state operations", () => {
	it("builds default active ids from the first available root and pane", () => {
		const root = createPaneRoot({
			id: "root-main",
			groupId: "group-root",
			panes: [createTestPane("pane-a"), createTestPane("pane-b")],
		});

		const state = createPaneWorkspaceState({
			roots: [root],
		});

		expect(root.activeGroupId).toBe("group-root");
		expect(root.root.type).toBe("group");
		if (root.root.type !== "group") {
			throw new Error("Expected group root");
		}
		expect(root.root.activePaneId).toBe("pane-a");
		expect(state.activeRootId).toBe("root-main");
	});

	it("adds roots, removes the active root, and falls back to the next root", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-a",
						groupId: "group-a",
						panes: [createTestPane("pane-a")],
					}),
				],
			}),
		});

		store.getState().addRoot(
			createPaneRoot({
				id: "root-b",
				groupId: "group-b",
				panes: [createTestPane("pane-b")],
			}),
		);
		store.getState().removeRoot("root-a");

		expect(store.getState().state.roots.map((root) => root.id)).toEqual([
			"root-b",
		]);
		expect(store.getState().state.activeRootId).toBe("root-b");
	});

	it("sets the active group without disturbing the active root", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [
					{
						id: "root-main",
						activeGroupId: "group-left",
						root: {
							type: "split",
							id: "split-root",
							direction: "horizontal",
							sizes: [50, 50],
							children: [
								{
									type: "group",
									id: "group-left",
									activePaneId: "pane-a",
									panes: [createTestPane("pane-a")],
								},
								{
									type: "group",
									id: "group-right",
									activePaneId: "pane-b",
									panes: [createTestPane("pane-b")],
								},
							],
						},
					},
				],
			}),
		});

		store.getState().setActiveGroup({
			rootId: "root-main",
			groupId: "group-right",
		});

		expect(store.getState().state.activeRootId).toBe("root-main");
		expect(store.getState().state.roots[0]?.activeGroupId).toBe("group-right");
	});

	it("updates a root title override without affecting the active root", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-main",
						titleOverride: "Main",
						groupId: "group-root",
						panes: [createTestPane("pane-a")],
					}),
				],
			}),
		});

		store.getState().setRootTitleOverride({
			rootId: "root-main",
			titleOverride: "Renamed",
		});

		expect(store.getState().state.activeRootId).toBe("root-main");
		expect(store.getState().state.roots[0]?.titleOverride).toBe("Renamed");
	});

	it("updates pane data in place by pane id", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-main",
						groupId: "group-root",
						panes: [createTestPane("pane-a", "A")],
					}),
				],
			}),
		});

		store.getState().setPaneData({
			paneId: "pane-a",
			data: { label: "Updated" },
		});

		expect(store.getState().getPane("pane-a")?.pane.data).toEqual({
			label: "Updated",
		});
	});

	it("splits a group and adds a sibling group", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
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
			newPane: createTestPane("pane-b", "B"),
		});

		const nextState = store.getState().state;

		const root = getFirstRoot(nextState);
		expect(root.root.type).toBe("split");
		expect(root.activeGroupId).toMatch(/^group-/);

		const splitNode = root.root.type === "split" ? root.root : null;
		expect(splitNode?.children[1]).toMatchObject({
			type: "group",
			activePaneId: "pane-b",
		});
		expect(splitNode?.children[1]?.id).toMatch(/^group-/);
	});

	it("splits with custom metadata and preserves the current group when requested", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-main",
						groupId: "group-root",
						panes: [createTestPane("pane-a")],
					}),
				],
			}),
		});

		store.getState().splitGroup({
			rootId: "root-main",
			groupId: "group-root",
			position: "top",
			newPane: createTestPane("pane-b"),
			selectNewPane: false,
			sizes: [30, 70],
		});

		const root = getFirstRoot(store.getState().state);
		expect(root.activeGroupId).toBe("group-root");
		expect(root.root).toMatchObject({
			type: "split",
			direction: "vertical",
			sizes: [30, 70],
		});

		if (root.root.type !== "split") {
			throw new Error("Expected split root");
		}

		expect(root.root.children[0]).toMatchObject({
			type: "group",
		});
		expect(root.root.id).toMatch(/^split-/);
		expect(root.root.children[0]?.id).toMatch(/^group-/);
		expect(root.root.children[1]).toMatchObject({
			type: "group",
			id: "group-root",
		});
	});

	it("moves a pane across roots", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
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

		const nextState = store.getState().state;

		const sourceGroup =
			nextState.roots[0]?.root.type === "group"
				? nextState.roots[0]?.root
				: null;
		const targetGroup =
			nextState.roots[1]?.root.type === "group"
				? nextState.roots[1]?.root
				: null;

		expect(sourceGroup?.panes).toEqual([]);
		expect(targetGroup?.panes.map((pane) => pane.id)).toEqual([
			"pane-b",
			"pane-a",
		]);
		expect(targetGroup?.activePaneId).toBe("pane-a");
		expect(nextState.activeRootId).toBe("root-target");
	});

	it("reorders a pane inside the same group with index adjustment", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-main",
						groupId: "group-root",
						panes: [
							createTestPane("pane-a"),
							createTestPane("pane-b"),
							createTestPane("pane-c"),
						],
					}),
				],
			}),
		});

		store.getState().movePane({
			paneId: "pane-a",
			targetRootId: "root-main",
			targetGroupId: "group-root",
			index: 2,
			select: true,
		});

		const root = getFirstRoot(store.getState().state);
		if (root.root.type !== "group") {
			throw new Error("Expected group root");
		}

		expect(root.root.panes.map((pane) => pane.id)).toEqual([
			"pane-b",
			"pane-a",
			"pane-c",
		]);
		expect(root.root.activePaneId).toBe("pane-a");
	});

	it("adds a pane to a group at a specific index", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
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

		const nextState = store.getState().state;

		const group =
			nextState.roots[0]?.root.type === "group"
				? nextState.roots[0]?.root
				: null;
		expect(group?.panes.map((pane) => pane.id)).toEqual([
			"pane-a",
			"pane-b",
			"pane-c",
		]);
	});

	it("clamps add-pane indexes and can select the inserted pane", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-main",
						groupId: "group-root",
						panes: [createTestPane("pane-b"), createTestPane("pane-c")],
					}),
				],
			}),
		});

		store.getState().addPaneToGroup({
			rootId: "root-main",
			groupId: "group-root",
			pane: createTestPane("pane-a"),
			index: -10,
			select: true,
		});

		const root = getFirstRoot(store.getState().state);
		if (root.root.type !== "group") {
			throw new Error("Expected group root");
		}

		expect(root.root.panes.map((pane) => pane.id)).toEqual([
			"pane-a",
			"pane-b",
			"pane-c",
		]);
		expect(root.root.activePaneId).toBe("pane-a");
		expect(root.activeGroupId).toBe("group-root");
	});

	it("replaces the existing unpinned pane when opening in preview mode", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-main",
						groupId: "group-root",
						panes: [
							{ ...createTestPane("pane-pinned"), pinned: true },
							{ ...createTestPane("pane-preview"), pinned: false },
						],
						activePaneId: "pane-preview",
					}),
				],
			}),
		});

		store.getState().addPaneToGroup({
			rootId: "root-main",
			groupId: "group-root",
			pane: { ...createTestPane("pane-next-preview"), pinned: false },
			replaceUnpinned: true,
		});

		const root = getFirstRoot(store.getState().state);
		if (root.root.type !== "group") {
			throw new Error("Expected group root");
		}

		expect(root.root.panes.map((pane) => pane.id)).toEqual([
			"pane-pinned",
			"pane-next-preview",
		]);
		expect(root.root.activePaneId).toBe("pane-next-preview");
	});

	it("pins a pane so later preview opens append instead of replacing it", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-main",
						groupId: "group-root",
						panes: [{ ...createTestPane("pane-preview"), pinned: false }],
					}),
				],
			}),
		});

		store.getState().setPanePinned({
			rootId: "root-main",
			groupId: "group-root",
			paneId: "pane-preview",
			pinned: true,
		});
		store.getState().addPaneToGroup({
			rootId: "root-main",
			groupId: "group-root",
			pane: { ...createTestPane("pane-second-preview"), pinned: false },
			replaceUnpinned: true,
		});

		const root = getFirstRoot(store.getState().state);
		if (root.root.type !== "group") {
			throw new Error("Expected group root");
		}

		expect(root.root.panes.map((pane) => pane.id)).toEqual([
			"pane-preview",
			"pane-second-preview",
		]);
		expect(root.root.panes[0]?.pinned).toBe(true);
	});

	it("closes the active pane and selects the next available pane", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
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

		const nextState = store.getState().state;

		const group =
			nextState.roots[0]?.root.type === "group"
				? nextState.roots[0]?.root
				: null;
		expect(group?.panes.map((pane) => pane.id)).toEqual(["pane-b"]);
		expect(group?.activePaneId).toBe("pane-b");
	});

	it("resizes an existing split node", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [
					{
						id: "root-main",
						activeGroupId: "group-left",
						root: {
							type: "split",
							id: "split-root",
							direction: "horizontal",
							sizes: [50, 50],
							children: [
								{
									type: "group",
									id: "group-left",
									activePaneId: "pane-a",
									panes: [createTestPane("pane-a")],
								},
								{
									type: "group",
									id: "group-right",
									activePaneId: "pane-b",
									panes: [createTestPane("pane-b")],
								},
							],
						},
					},
				],
			}),
		});

		store.getState().resizeSplit({
			rootId: "root-main",
			splitId: "split-root",
			sizes: [35, 65],
		});

		const root = getFirstRoot(store.getState().state);
		expect(root.root).toMatchObject({
			type: "split",
			id: "split-root",
			sizes: [35, 65],
		});
	});

	it("equalizes split sizes across all children", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [
					{
						id: "root-main",
						activeGroupId: "group-a",
						root: {
							type: "split",
							id: "split-root",
							direction: "horizontal",
							sizes: [10, 30, 60],
							children: [
								{
									type: "group",
									id: "group-a",
									activePaneId: "pane-a",
									panes: [createTestPane("pane-a")],
								},
								{
									type: "group",
									id: "group-b",
									activePaneId: "pane-b",
									panes: [createTestPane("pane-b")],
								},
								{
									type: "group",
									id: "group-c",
									activePaneId: "pane-c",
									panes: [createTestPane("pane-c")],
								},
							],
						},
					},
				],
			}),
		});

		store.getState().equalizeSplit({
			rootId: "root-main",
			splitId: "split-root",
		});

		const root = getFirstRoot(store.getState().state);
		expect(root.root).toMatchObject({
			type: "split",
			id: "split-root",
			sizes: [100 / 3, 100 / 3, 100 / 3],
		});
	});

	it("treats invalid ids as no-ops", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [
					createPaneRoot({
						id: "root-main",
						groupId: "group-root",
						panes: [createTestPane("pane-a"), createTestPane("pane-b")],
					}),
				],
			}),
		});

		const before = structuredClone(store.getState().state);

		store.getState().setActiveRoot("missing-root");
		store.getState().setActiveGroup({
			rootId: "root-main",
			groupId: "missing-group",
		});
		store.getState().setActivePane({
			rootId: "root-main",
			groupId: "group-root",
			paneId: "missing-pane",
		});
		store.getState().movePane({
			paneId: "missing-pane",
			targetRootId: "root-main",
			targetGroupId: "group-root",
		});
		store.getState().resizeSplit({
			rootId: "root-main",
			splitId: "missing-split",
			sizes: [10, 90],
		});

		expect(store.getState().state).toEqual(before);
	});

	it("updates active pane without going through a reducer action union", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
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

		const nextState = store.getState().state;

		const group =
			nextState.roots[0]?.root.type === "group"
				? nextState.roots[0]?.root
				: null;
		expect(group?.activePaneId).toBe("pane-b");
	});
});

describe("createPaneWorkspaceStore", () => {
	it("wraps the pure operations in ergonomic Zustand methods", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
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

		const root = getFirstRoot(store.getState().state);
		const group = root.root.type === "group" ? root.root : null;
		expect(store.getState().state.activeRootId).toBe("root-main");
		expect(root.activeGroupId).toBe("group-root");
		expect(group?.activePaneId).toBe("pane-b");
	});

	it("exposes active-root, group, and pane selectors for renderer code", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [
					{
						id: "root-main",
						activeGroupId: "group-right",
						root: {
							type: "split",
							id: "split-root",
							direction: "horizontal",
							sizes: [50, 50],
							children: [
								{
									type: "group",
									id: "group-left",
									activePaneId: "pane-a",
									panes: [createTestPane("pane-a")],
								},
								{
									type: "group",
									id: "group-right",
									activePaneId: "pane-b",
									panes: [createTestPane("pane-b", "File B")],
								},
							],
						},
					},
				],
			}),
		});

		expect(store.getState().getActiveRoot()?.id).toBe("root-main");
		expect(store.getState().getActiveGroup()?.id).toBe("group-right");
		expect(store.getState().getPane("pane-b")).toMatchObject({
			rootId: "root-main",
			groupId: "group-right",
			paneIndex: 0,
			pane: {
				id: "pane-b",
				data: { label: "File B" },
			},
		});
		expect(store.getState().getActivePane()).toMatchObject({
			rootId: "root-main",
			groupId: "group-right",
			paneIndex: 0,
			pane: {
				id: "pane-b",
			},
		});
	});

	it("supports direct state replacement", () => {
		const store = createPaneWorkspaceStore<TestPaneData>({
			initialState: createPaneWorkspaceState({
				roots: [],
			}),
		});

		store.getState().replaceState((prev: PaneWorkspaceState<TestPaneData>) => ({
			...prev,
			activeRootId: "root-created",
		}));

		expect(store.getState().state.activeRootId).toBe("root-created");
	});
});
