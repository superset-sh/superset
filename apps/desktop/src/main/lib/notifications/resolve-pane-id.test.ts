import { describe, expect, it } from "bun:test";
import { resolvePaneIdFromTabsState } from "./resolve-pane-id";

describe("resolvePaneIdFromTabsState", () => {
	const tabsState = {
		tabs: [
			{
				id: "tab-1",
				name: "Tab",
				workspaceId: "ws-1",
				createdAt: Date.now(),
				layout: "pane-1",
			},
		],
		panes: {
			"pane-1": {
				id: "pane-1",
				tabId: "tab-1",
				type: "terminal" as const,
				name: "Terminal",
			},
			"pane-chat": {
				id: "pane-chat",
				tabId: "tab-1",
				type: "chat" as const,
				name: "Chat",
				chat: {
					sessionId: "session-1",
					launchConfig: null,
				},
			},
		},
		activeTabIds: { "ws-1": "tab-1" },
		focusedPaneIds: { "tab-1": "pane-1" },
		tabHistoryStacks: {},
	};

	it("trusts an explicit paneId even before main-process tabsState catches up", () => {
		expect(
			resolvePaneIdFromTabsState(
				{
					tabs: [],
					panes: {},
					activeTabIds: {},
					focusedPaneIds: {},
					tabHistoryStacks: {},
				},
				"pane-new",
				"tab-new",
				"ws-new",
				undefined,
			),
		).toBe("pane-new");
	});

	it("resolves the focused pane from tabId when paneId is missing", () => {
		expect(
			resolvePaneIdFromTabsState(
				tabsState,
				undefined,
				"tab-1",
				undefined,
				undefined,
			),
		).toBe("pane-1");
	});

	it("resolves the focused pane from workspaceId when paneId is missing", () => {
		expect(
			resolvePaneIdFromTabsState(
				tabsState,
				undefined,
				undefined,
				"ws-1",
				undefined,
			),
		).toBe("pane-1");
	});

	it("resolves the pane from sessionId when paneId is missing", () => {
		expect(
			resolvePaneIdFromTabsState(
				tabsState,
				undefined,
				undefined,
				undefined,
				"session-1",
			),
		).toBe("pane-chat");
	});
});
