import { describe, expect, test } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import type { Pane, Tab, TabsState } from "./types";
import {
	extractPaneIdsFromLayout,
	resolveActiveTabIdForWorkspace,
} from "./utils";

/**
 * Reproduction for #4840.
 *
 * The user reports that — without any specific user action — one workspace
 * suddenly shows a second tab that is a terminal from another workspace.
 * The duplicate "remains fixed at the step it was when replicated" while the
 * original terminal continues to evolve in the source workspace.
 *
 * Tabs are stored in a single global store and rendered per-workspace via a
 * `tab.workspaceId === activeWorkspaceId` filter
 * (see GroupStrip.tsx). Live xterm runtimes are keyed by `paneId`, not by
 * workspace. Once two tabs in different workspaces reference the same pane,
 * only one mount attaches to the live runtime — the other surfaces a stale
 * buffer snapshot. That matches the "frozen" symptom from the issue.
 *
 * The data model has no invariant that prevents this state from being
 * persisted or rendered. These tests assert the invariants we WANT the data
 * layer to hold; they fail today because nothing enforces them.
 */

const WORKSPACE_A = "ws-a";
const WORKSPACE_B = "ws-b";

const createTab = (
	id: string,
	workspaceId: string,
	layout: MosaicNode<string>,
	name = id,
): Tab => ({
	id,
	name,
	workspaceId,
	layout,
	createdAt: 0,
});

const createTerminalPane = (id: string, tabId: string): Pane => ({
	id,
	tabId,
	type: "terminal",
	name: "Terminal",
});

/**
 * Build a state representative of the user-visible bug:
 * - workspace A owns an original terminal pane "pane-original" via "tab-a"
 * - workspace B has its own legitimate "tab-b"
 * - a "ghost" tab in workspace B whose layout references workspace A's pane
 *   — this is what the user sees as "a second tab which is a terminal from
 *   another workspace replicated there"
 */
const buildReplicatedState = (): TabsState => {
	const originalPane = createTerminalPane("pane-original", "tab-a");
	const originalTab = createTab("tab-a", WORKSPACE_A, originalPane.id);
	const ghostTab = createTab("tab-ghost", WORKSPACE_B, originalPane.id);
	const ownPane = createTerminalPane("pane-b", "tab-b");
	const ownTab = createTab("tab-b", WORKSPACE_B, ownPane.id);

	return {
		tabs: [originalTab, ghostTab, ownTab],
		panes: {
			[originalPane.id]: originalPane,
			[ownPane.id]: ownPane,
		},
		activeTabIds: {
			[WORKSPACE_A]: originalTab.id,
			[WORKSPACE_B]: ownTab.id,
		},
		focusedPaneIds: {
			[originalTab.id]: originalPane.id,
			[ownTab.id]: ownPane.id,
		},
		tabHistoryStacks: {
			[WORKSPACE_A]: [originalTab.id],
			[WORKSPACE_B]: [ownTab.id],
		},
		closedTabsStack: [],
	};
};

const tabsForWorkspace = (state: TabsState, workspaceId: string): Tab[] =>
	state.tabs.filter((tab) => tab.workspaceId === workspaceId);

/**
 * Invariant we want the data layer to enforce: for every tab visible in a
 * workspace, every pane referenced by that tab's layout must be owned by a
 * tab in the same workspace.
 */
const findCrossWorkspacePaneReferences = (
	state: TabsState,
): Array<{ tabId: string; paneId: string; ownerWorkspaceId: string }> => {
	const mismatches: Array<{
		tabId: string;
		paneId: string;
		ownerWorkspaceId: string;
	}> = [];
	for (const tab of state.tabs) {
		for (const paneId of extractPaneIdsFromLayout(tab.layout)) {
			const pane = state.panes[paneId];
			if (!pane) continue;
			const owningTab = state.tabs.find(
				(candidate) => candidate.id === pane.tabId,
			);
			if (!owningTab) continue;
			if (owningTab.workspaceId !== tab.workspaceId) {
				mismatches.push({
					tabId: tab.id,
					paneId,
					ownerWorkspaceId: owningTab.workspaceId,
				});
			}
		}
	}
	return mismatches;
};

describe("cross-workspace tab replication (#4840)", () => {
	test("workspace B should not surface a tab whose pane is owned by workspace A", () => {
		const state = buildReplicatedState();

		const workspaceBTabs = tabsForWorkspace(state, WORKSPACE_B);
		const ghostTab = workspaceBTabs.find((tab) => tab.id === "tab-ghost");
		expect(ghostTab).toBeUndefined();
	});

	test("active-tab resolution should not return a tab whose panes belong to another workspace", () => {
		const state = buildReplicatedState();
		// Simulate the ghost being marked active for workspace B (e.g. after a
		// transient activation during the bug).
		const stateWithGhostActive: TabsState = {
			...state,
			activeTabIds: { ...state.activeTabIds, [WORKSPACE_B]: "tab-ghost" },
			tabHistoryStacks: {
				...state.tabHistoryStacks,
				[WORKSPACE_B]: ["tab-ghost", "tab-b"],
			},
		};

		const resolved = resolveActiveTabIdForWorkspace({
			workspaceId: WORKSPACE_B,
			tabs: stateWithGhostActive.tabs,
			activeTabIds: stateWithGhostActive.activeTabIds,
			tabHistoryStacks: stateWithGhostActive.tabHistoryStacks,
		});

		expect(resolved).not.toBe("tab-ghost");
	});

	test("state should never contain a tab referencing panes owned by a different workspace", () => {
		const state = buildReplicatedState();
		expect(findCrossWorkspacePaneReferences(state)).toEqual([]);
	});
});
