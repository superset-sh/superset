import { beforeEach, describe, expect, it } from "bun:test";
import {
	getV2NotificationSourceIdsForPane,
	getV2NotificationSourceIdsForTab,
	selectV2PaneNotificationStatus,
	selectV2SourceIdsNotificationStatus,
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

	it("maps panes and tabs to notification source ids", () => {
		expect(getV2NotificationSourceIdsForPane(terminalPane)).toEqual([
			"terminal-1",
		]);
		expect(getV2NotificationSourceIdsForPane(chatPane)).toEqual([]);
		expect(getV2NotificationSourceIdsForTab(tab)).toEqual([
			"terminal-1",
			"terminal-2",
		]);
	});

	it("derives workspace, tab, pane, and terminal status from terminal sources", () => {
		const store = useV2NotificationStore.getState();
		store.setTerminalStatus("terminal-1", "workspace-1", "working", 100);
		store.setTerminalStatus("terminal-2", "workspace-1", "permission", 101);
		store.setTerminalStatus("terminal-3", "workspace-2", "review", 102);

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
		expect(
			selectV2TerminalNotificationStatus("workspace-1", "terminal-2")(state),
		).toBe("permission");
		expect(
			selectV2SourceIdsNotificationStatus("workspace-1", [
				"terminal-1",
				"terminal-2",
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

		store.clearSourceAttention("terminal-1", "workspace-1");
		store.clearSourceAttention("terminal-2", "workspace-1");

		const state = useV2NotificationStore.getState();
		expect(state.sources["terminal-1"]).toBeUndefined();
		expect(state.sources["terminal-2"]?.status).toBe("permission");
	});
});
