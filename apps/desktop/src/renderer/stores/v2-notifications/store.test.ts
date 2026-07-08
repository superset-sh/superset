import { beforeEach, describe, expect, it } from "bun:test";
import {
	getV2NotificationSourcesForPane,
	getV2NotificationSourcesForTab,
	migrateV2NotificationState,
	useV2NotificationStore,
} from "./store";

const terminalPane = {
	id: "pane-1",
	kind: "terminal",
	data: { terminalId: "terminal-1" },
};
const secondTerminalPane = {
	id: "pane-2",
	kind: "terminal",
	data: { terminalId: "terminal-2" },
};
const chatPane = {
	id: "pane-3",
	kind: "chat",
	data: { sessionId: "session-1" },
};
const tab = {
	id: "tab-1",
	createdAt: 0,
	activePaneId: "pane-1",
	layout: { type: "pane", paneId: "pane-1" } as const,
	panes: {
		"pane-1": terminalPane,
		"pane-2": secondTerminalPane,
		"pane-3": chatPane,
	},
};

describe("v2 notification store", () => {
	beforeEach(() => {
		useV2NotificationStore.setState({ manualUnread: {}, terminalSeenAt: {} });
	});

	it("marks terminal seen monotonically and prunes entries", () => {
		const store = useV2NotificationStore.getState();
		store.markTerminalSeen("terminal-1", 200);
		store.markTerminalSeen("terminal-1", 100);
		expect(useV2NotificationStore.getState().terminalSeenAt["terminal-1"]).toBe(
			200,
		);
		store.markTerminalSeen("terminal-1", 300);
		expect(useV2NotificationStore.getState().terminalSeenAt["terminal-1"]).toBe(
			300,
		);
		store.pruneTerminalSeen("terminal-1");
		expect(
			useV2NotificationStore.getState().terminalSeenAt["terminal-1"],
		).toBeUndefined();
	});

	it("sets and clears manual unread per workspace", () => {
		const store = useV2NotificationStore.getState();
		store.setManualUnread("workspace-1");
		expect(useV2NotificationStore.getState().manualUnread["workspace-1"]).toBe(
			true,
		);
		store.clearManualUnread("workspace-1");
		expect(
			useV2NotificationStore.getState().manualUnread["workspace-1"],
		).toBeUndefined();
	});

	it("migrates v1 persisted state, keeping only manual unread marks", () => {
		const migrated = migrateV2NotificationState(
			{
				sources: {
					"terminal:terminal-1": {
						workspaceId: "workspace-1",
						status: "working",
					},
					"manual:workspace-2": {
						workspaceId: "workspace-2",
						status: "review",
					},
				},
			},
			1,
		);
		expect(migrated.manualUnread).toEqual({ "workspace-2": true });
		expect(migrated.terminalSeenAt).toEqual({});
	});

	it("keeps version-2 persisted state intact", () => {
		const migrated = migrateV2NotificationState(
			{
				manualUnread: { "workspace-1": true },
				terminalSeenAt: { "terminal-1": 100 },
			},
			2,
		);
		expect(migrated.manualUnread).toEqual({ "workspace-1": true });
		expect(migrated.terminalSeenAt).toEqual({ "terminal-1": 100 });
	});

	it("maps panes and tabs to typed notification sources", () => {
		expect(getV2NotificationSourcesForPane(terminalPane)).toEqual([
			{ type: "terminal", id: "terminal-1" },
		]);
		expect(getV2NotificationSourcesForPane(chatPane)).toEqual([
			{ type: "chat", id: "session-1" },
		]);
		expect(getV2NotificationSourcesForTab(tab)).toEqual([
			{ type: "terminal", id: "terminal-1" },
			{ type: "terminal", id: "terminal-2" },
			{ type: "chat", id: "session-1" },
		]);
	});
});
