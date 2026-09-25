import { beforeEach, describe, expect, it } from "bun:test";
import {
	getNotificationSourcesForPane,
	getNotificationSourcesForTab,
	migrateNotificationState,
	useNotificationStore,
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
const tab = {
	id: "tab-1",
	createdAt: 0,
	activePaneId: "pane-1",
	layout: { type: "pane", paneId: "pane-1" } as const,
	panes: {
		"pane-1": terminalPane,
		"pane-2": secondTerminalPane,
	},
};

describe("v2 notification store", () => {
	beforeEach(() => {
		useNotificationStore.setState({ manualUnread: {}, terminalSeenAt: {} });
	});

	it("marks terminal seen monotonically and prunes entries", () => {
		const store = useNotificationStore.getState();
		store.markTerminalSeen("terminal-1", 200);
		store.markTerminalSeen("terminal-1", 100);
		expect(useNotificationStore.getState().terminalSeenAt["terminal-1"]).toBe(
			200,
		);
		store.markTerminalSeen("terminal-1", 300);
		expect(useNotificationStore.getState().terminalSeenAt["terminal-1"]).toBe(
			300,
		);
		store.pruneTerminalSeen("terminal-1");
		expect(
			useNotificationStore.getState().terminalSeenAt["terminal-1"],
		).toBeUndefined();
	});

	it("sets and clears manual unread per workspace", () => {
		const store = useNotificationStore.getState();
		store.setManualUnread("workspace-1");
		expect(useNotificationStore.getState().manualUnread["workspace-1"]).toBe(
			true,
		);
		store.clearManualUnread("workspace-1");
		expect(
			useNotificationStore.getState().manualUnread["workspace-1"],
		).toBeUndefined();
	});

	it("migrates v1 persisted state, keeping only manual unread marks", () => {
		const migrated = migrateNotificationState(
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
		const migrated = migrateNotificationState(
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
		expect(getNotificationSourcesForPane(terminalPane)).toEqual([
			{ type: "terminal", id: "terminal-1" },
		]);
		expect(getNotificationSourcesForTab(tab)).toEqual([
			{ type: "terminal", id: "terminal-1" },
			{ type: "terminal", id: "terminal-2" },
		]);
	});
});
