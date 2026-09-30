import { describe, expect, it } from "bun:test";
import {
	createWorkspaceStore,
	type LayoutNode,
	type WorkspaceState,
	type WorkspaceStore,
} from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, PullRequestPaneData } from "../../types";
import { openPullRequestPaneInStore } from "./openPullRequestPaneInStore";

const REPO = "superset-sh/superset";

function paneLayout(paneId: string): LayoutNode {
	return { type: "pane", paneId };
}

function workspaceState(existing?: {
	tabId: string;
	paneId: string;
	data: PullRequestPaneData;
}): WorkspaceState<PaneViewerData> {
	return {
		version: 1,
		activeTabId: "tab-1",
		tabs: [
			{
				id: "tab-1",
				createdAt: 1,
				activePaneId: "pane-1",
				layout: paneLayout("pane-1"),
				panes: {
					"pane-1": {
						id: "pane-1",
						kind: "diff",
						data: { path: "", collapsedFiles: [] } as PaneViewerData,
					},
				},
			},
			...(existing
				? [
						{
							id: existing.tabId,
							createdAt: 2,
							activePaneId: existing.paneId,
							layout: paneLayout(existing.paneId),
							panes: {
								[existing.paneId]: {
									id: existing.paneId,
									kind: "pull-request",
									data: existing.data as PaneViewerData,
								},
							},
						},
					]
				: []),
		],
	};
}

function findPullRequestPanes(store: StoreApi<WorkspaceStore<PaneViewerData>>) {
	return store.getState().tabs.flatMap((tab) =>
		Object.values(tab.panes)
			.filter((pane) => pane.kind === "pull-request")
			.map((pane) => ({ tabId: tab.id, pane })),
	);
}

function paneData(store: StoreApi<WorkspaceStore<PaneViewerData>>) {
	return findPullRequestPanes(store)[0]?.pane.data as
		| PullRequestPaneData
		| undefined;
}

describe("openPullRequestPaneInStore", () => {
	it("splits the active pane when no pull-request pane exists", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});

		openPullRequestPaneInStore(store, { repoFullName: REPO, number: 42 });

		const state = store.getState();
		expect(state.tabs).toHaveLength(1);
		const panes = findPullRequestPanes(store);
		expect(panes).toHaveLength(1);
		expect(paneData(store)).toEqual({ repoFullName: REPO, number: 42 });
		expect(state.tabs[0]?.activePaneId).toBe(panes[0]?.pane.id);
		expect(state.tabs[0]?.layout.type).toBe("split");
	});

	it("focuses an existing pane for the same PR without touching its data", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState({
				tabId: "tab-2",
				paneId: "pr-pane",
				data: { repoFullName: REPO, number: 42 },
			}),
		});
		const before = store.getState().tabs[1]?.panes["pr-pane"]?.data;

		openPullRequestPaneInStore(store, { repoFullName: REPO, number: 42 });

		const state = store.getState();
		expect(state.activeTabId).toBe("tab-2");
		expect(state.tabs[1]?.activePaneId).toBe("pr-pane");
		expect(state.tabs[1]?.panes["pr-pane"]?.data).toBe(before);
		expect(findPullRequestPanes(store)).toHaveLength(1);
	});

	it("retargets the existing pane when the PR number changes", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState({
				tabId: "tab-2",
				paneId: "pr-pane",
				data: { repoFullName: REPO, number: 42 },
			}),
		});

		openPullRequestPaneInStore(store, { repoFullName: REPO, number: 43 });

		expect(findPullRequestPanes(store)).toHaveLength(1);
		expect(paneData(store)).toEqual({ repoFullName: REPO, number: 43 });
		expect(store.getState().activeTabId).toBe("tab-2");
	});

	it("retargets when the same number belongs to another repository", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState({
				tabId: "tab-2",
				paneId: "pr-pane",
				data: { repoFullName: REPO, number: 42 },
			}),
		});

		openPullRequestPaneInStore(store, {
			repoFullName: "superset-sh/docs",
			number: 42,
		});

		expect(findPullRequestPanes(store)).toHaveLength(1);
		expect(paneData(store)).toEqual({
			repoFullName: "superset-sh/docs",
			number: 42,
		});
	});

	it("retargets the same IID when the GitLab instance changes", () => {
		const first = {
			repoFullName: "group/subgroup/project",
			number: 42,
			provider: "gitlab" as const,
			instance: "https://gitlab.com",
			repoPath: "group/subgroup/project",
		};
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState({
				tabId: "tab-2",
				paneId: "pr-pane",
				data: first,
			}),
		});
		const second = { ...first, instance: "https://gitlab.example.com" };

		openPullRequestPaneInStore(store, second);

		expect(findPullRequestPanes(store)).toHaveLength(1);
		expect(paneData(store)).toEqual(second);
	});

	it("treats an old pane without provider fields as GitHub", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState({
				tabId: "tab-2",
				paneId: "pr-pane",
				data: { repoFullName: REPO, number: 42 },
			}),
		});
		const before = paneData(store);

		openPullRequestPaneInStore(store, {
			repoFullName: REPO,
			number: 42,
			provider: "github",
			instance: "https://github.com",
			repoPath: REPO,
		});

		expect(paneData(store)).toBe(before);
	});

	it("requires a complete identity for new GitLab panes", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});
		expect(() =>
			openPullRequestPaneInStore(store, {
				repoFullName: "group/subgroup/project",
				number: 42,
				provider: "gitlab",
			}),
		).toThrow("identity is incomplete");
	});
});
