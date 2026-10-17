import { describe, expect, it } from "bun:test";
import {
	createWorkspaceStore,
	type WorkspaceState,
	type WorkspaceStore,
} from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../../../types";
import {
	runUrlLinkAction,
	terminalPullRequestLinkAction,
} from "./runTerminalLinkAction";

const PR_URL = "https://github.com/superset-sh/superset/pull/8412";

function workspaceState(): WorkspaceState<PaneViewerData> {
	return {
		version: 1,
		activeTabId: "tab-1",
		tabs: [
			{
				id: "tab-1",
				createdAt: 1,
				activePaneId: "pane-1",
				layout: { type: "pane", paneId: "pane-1" },
				panes: {
					"pane-1": {
						id: "pane-1",
						kind: "diff",
						data: { path: "", collapsedFiles: [] } as PaneViewerData,
					},
				},
			},
		],
	};
}

function panesOfKind(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	kind: string,
) {
	return store
		.getState()
		.tabs.flatMap((tab) => Object.values(tab.panes))
		.filter((pane) => pane.kind === kind);
}

describe("runUrlLinkAction", () => {
	it("opens a GitHub pull request URL in the pull-request pane", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});

		runUrlLinkAction({ store }, PR_URL, "pane");

		expect(panesOfKind(store, "browser")).toHaveLength(0);
		expect(panesOfKind(store, "pull-request").map((pane) => pane.data)).toEqual(
			[{ repoFullName: "superset-sh/superset", number: 8412 }],
		);
	});

	it("opens the pull request in the right pane whenever one exists", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});
		const rightStore = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});
		let revealed = false;

		runUrlLinkAction(
			{
				store,
				rightPane: { store: rightStore, reveal: () => (revealed = true) },
			},
			PR_URL,
			"pane",
		);

		expect(revealed).toBe(true);
		expect(panesOfKind(store, "pull-request")).toHaveLength(0);
		expect(panesOfKind(rightStore, "browser")).toHaveLength(0);
		expect(panesOfKind(rightStore, "pull-request")).toHaveLength(1);
	});

	it("gives a new tab to a PR opened with the new-tab action", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});

		runUrlLinkAction({ store }, PR_URL, "newTab");

		const tabs = store.getState().tabs;
		expect(tabs).toHaveLength(2);
		expect(Object.values(tabs[1]?.panes ?? {})[0]?.kind).toBe("pull-request");
	});

	it("keeps PR comment, file and commit links in the browser", () => {
		for (const url of [
			`${PR_URL}#discussion_r123`,
			`${PR_URL}/files`,
			`${PR_URL}/commits/abc123`,
			"https://github.com/a/b?next=/pull/123",
		]) {
			const store = createWorkspaceStore<PaneViewerData>({
				initialState: workspaceState(),
			});

			runUrlLinkAction({ store }, url, "pane");

			expect(panesOfKind(store, "pull-request")).toHaveLength(0);
			expect(panesOfKind(store, "browser")).toHaveLength(1);
			expect(
				terminalPullRequestLinkAction(
					{ metaKey: false, ctrlKey: false, shiftKey: false },
					url,
				),
			).toBeNull();
		}
	});

	it("still opens other GitHub URLs in a browser pane", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});

		runUrlLinkAction(
			{ store },
			"https://github.com/superset-sh/superset/issues/1",
			"pane",
		);

		expect(panesOfKind(store, "pull-request")).toHaveLength(0);
		expect(panesOfKind(store, "browser")).toHaveLength(1);
	});
});

describe("terminalPullRequestLinkAction", () => {
	const click = { metaKey: false, ctrlKey: false, shiftKey: false };

	it("opens the PR pane on plain click and the system browser on shift-click", () => {
		expect(terminalPullRequestLinkAction(click, PR_URL)).toBe("pane");
		expect(
			terminalPullRequestLinkAction({ ...click, shiftKey: true }, PR_URL),
		).toBe("external");
	});

	it("leaves cmd-clicks and non-PR URLs to the URL link settings", () => {
		expect(
			terminalPullRequestLinkAction({ ...click, metaKey: true }, PR_URL),
		).toBeNull();
		expect(
			terminalPullRequestLinkAction(click, "https://github.com/a/b/issues/1"),
		).toBeNull();
	});
});
