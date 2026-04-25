import { beforeEach, describe, expect, it } from "bun:test";
import {
	getV2NotificationSourcesForPane,
	getV2NotificationSourcesForTab,
	selectV2ChatNotificationStatus,
	selectV2PaneNotificationStatus,
	selectV2SourcesNotificationStatus,
	selectV2TabNotificationStatus,
	selectV2TerminalNotificationStatus,
	selectV2WorkspaceNotificationStatus,
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
		useV2NotificationStore.setState({ sources: {} });
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

	it("derives workspace, tab, pane, terminal, and chat status from sources", () => {
		const store = useV2NotificationStore.getState();
		store.setTerminalStatus("terminal-1", "workspace-1", "working", 100);
		store.setTerminalStatus("terminal-2", "workspace-1", "permission", 101);
		store.setTerminalStatus("terminal-3", "workspace-2", "review", 102);
		store.setChatStatus("session-1", "workspace-1", "review", 103);

		const state = useV2NotificationStore.getState();
		expect(selectV2WorkspaceNotificationStatus("workspace-1")(state)).toBe(
			"permission",
		);
		expect(selectV2TabNotificationStatus("workspace-1", tab)(state)).toBe(
			"permission",
		);
		expect(
			selectV2PaneNotificationStatus("workspace-1", terminalPane)(state),
		).toBe("working");
		expect(selectV2PaneNotificationStatus("workspace-1", chatPane)(state)).toBe(
			"review",
		);
		expect(
			selectV2TerminalNotificationStatus("workspace-1", "terminal-2")(state),
		).toBe("permission");
		expect(
			selectV2ChatNotificationStatus("workspace-1", "session-1")(state),
		).toBe("review");
		expect(
			selectV2SourcesNotificationStatus("workspace-1", [
				{ type: "terminal", id: "terminal-1" },
				{ type: "terminal", id: "terminal-2" },
			])(state),
		).toBe("permission");
		expect(
			selectV2TerminalNotificationStatus("workspace-1", "terminal-3")(state),
		).toBeNull();
	});

	it("clears only review attention for a source", () => {
		const store = useV2NotificationStore.getState();
		store.setTerminalStatus("terminal-1", "workspace-1", "review", 100);
		store.setTerminalStatus("terminal-2", "workspace-1", "permission", 101);

		store.clearSourceAttention(
			{ type: "terminal", id: "terminal-1" },
			"workspace-1",
		);
		store.clearSourceAttention(
			{ type: "terminal", id: "terminal-2" },
			"workspace-1",
		);

		const state = useV2NotificationStore.getState();
		expect(state.sources["terminal:terminal-1"]).toBeUndefined();
		expect(state.sources["terminal:terminal-2"]?.status).toBe("permission");
	});
});
