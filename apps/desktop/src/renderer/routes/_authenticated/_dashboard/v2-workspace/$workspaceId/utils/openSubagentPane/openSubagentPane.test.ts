import { describe, expect, it } from "bun:test";
import {
	createWorkspaceStore,
	type LayoutNode,
	type WorkspaceState,
} from "@superset/panes";
import type {
	ChatPaneData,
	PaneViewerData,
	SubagentPaneData,
} from "../../types";
import { findSubagentPaneLocation, openSubagentPane } from "./openSubagentPane";

function chatPane(id: string, sessionId: string) {
	return {
		id,
		kind: "chat",
		data: { sessionId } as ChatPaneData as PaneViewerData,
	};
}

function subagentPane(
	id: string,
	data: SubagentPaneData,
): {
	id: string;
	kind: string;
	data: PaneViewerData;
} {
	return {
		id,
		kind: "subagent",
		data: data as PaneViewerData,
	};
}

function paneLayout(paneId: string): LayoutNode {
	return { type: "pane", paneId };
}

function workspaceWithChat(): WorkspaceState<PaneViewerData> {
	return {
		version: 1,
		activeTabId: "tab-1",
		tabs: [
			{
				id: "tab-1",
				createdAt: 1,
				activePaneId: "chat-1",
				layout: paneLayout("chat-1"),
				panes: {
					"chat-1": chatPane("chat-1", "session-1"),
				},
			},
		],
	};
}

describe("openSubagentPane", () => {
	it("opens the first subagent to the right of the parent chat", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceWithChat(),
		});

		expect(
			openSubagentPane(store, {
				tabId: "tab-1",
				parentPaneId: "chat-1",
				parentSessionId: "session-1",
				toolCallId: "tool-1",
				task: "Explore codebase",
				agentType: "explore",
			}),
		).toBe("opened-right");

		const tab = store.getState().getTab("tab-1");
		expect(tab).toBeTruthy();
		const subagentPanes = Object.values(tab?.panes ?? {}).filter(
			(pane) => pane.kind === "subagent",
		);
		expect(subagentPanes).toHaveLength(1);
		expect((subagentPanes[0]?.data as SubagentPaneData).toolCallId).toBe(
			"tool-1",
		);
		expect(tab?.activePaneId).toBe("chat-1");
	});

	it("stacks subsequent subagents under the right column", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceWithChat(),
		});

		openSubagentPane(store, {
			tabId: "tab-1",
			parentPaneId: "chat-1",
			parentSessionId: "session-1",
			toolCallId: "tool-1",
			agentType: "explore",
		});
		expect(
			openSubagentPane(store, {
				tabId: "tab-1",
				parentPaneId: "chat-1",
				parentSessionId: "session-1",
				toolCallId: "tool-2",
				agentType: "execute",
			}),
		).toBe("stacked");

		const tab = store.getState().getTab("tab-1");
		const subagentPanes = Object.values(tab?.panes ?? {}).filter(
			(pane) => pane.kind === "subagent",
		);
		expect(subagentPanes).toHaveLength(2);
	});

	it("focuses an existing pane for the same toolCallId", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceWithChat(),
		});

		openSubagentPane(store, {
			tabId: "tab-1",
			parentPaneId: "chat-1",
			parentSessionId: "session-1",
			toolCallId: "tool-1",
		});

		expect(
			openSubagentPane(store, {
				tabId: "tab-1",
				parentPaneId: "chat-1",
				parentSessionId: "session-1",
				toolCallId: "tool-1",
			}),
		).toBe("focused");

		const tab = store.getState().getTab("tab-1");
		const subagentPanes = Object.values(tab?.panes ?? {}).filter(
			(pane) => pane.kind === "subagent",
		);
		expect(subagentPanes).toHaveLength(1);
	});

	it("finds an existing subagent pane location", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: {
				version: 1,
				activeTabId: "tab-1",
				tabs: [
					{
						id: "tab-1",
						createdAt: 1,
						activePaneId: "chat-1",
						layout: paneLayout("sub-1"),
						panes: {
							"chat-1": chatPane("chat-1", "session-1"),
							"sub-1": subagentPane("sub-1", {
								parentSessionId: "session-1",
								parentPaneId: "chat-1",
								toolCallId: "tool-9",
							}),
						},
					},
				],
			},
		});

		expect(findSubagentPaneLocation(store.getState(), "tool-9")).toEqual({
			tabId: "tab-1",
			paneId: "sub-1",
		});
	});
});
