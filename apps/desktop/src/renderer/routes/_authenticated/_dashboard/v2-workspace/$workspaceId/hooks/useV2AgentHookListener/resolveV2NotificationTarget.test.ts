import { describe, expect, it } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import type { PaneViewerData } from "../../types";
import {
	getNotificationSourceId,
	isV2NotificationTargetVisible,
	resolveTerminalTarget,
	resolveV2NotificationTarget,
} from "./resolveV2NotificationTarget";

const WORKSPACE_ID = "workspace-1";

const layout: WorkspaceState<PaneViewerData> = {
	version: 1,
	activeTabId: "tab-active",
	tabs: [
		{
			id: "tab-active",
			createdAt: 1,
			activePaneId: "pane-terminal",
			layout: { type: "pane", paneId: "pane-terminal" },
			panes: {
				"pane-terminal": {
					id: "pane-terminal",
					kind: "terminal",
					data: { terminalId: "terminal-1" },
				},
				"pane-chat-hidden": {
					id: "pane-chat-hidden",
					kind: "chat",
					data: { sessionId: "chat-1" },
				},
			},
		},
		{
			id: "tab-background",
			createdAt: 2,
			activePaneId: "pane-chat-background",
			layout: { type: "pane", paneId: "pane-chat-background" },
			panes: {
				"pane-chat-background": {
					id: "pane-chat-background",
					kind: "chat",
					data: { sessionId: "chat-2" },
				},
			},
		},
	],
};

function payload(
	overrides: Partial<AgentLifecyclePayload>,
): AgentLifecyclePayload {
	return {
		eventType: "Stop",
		occurredAt: 1,
		...overrides,
	};
}

describe("resolveV2NotificationTarget", () => {
	it("uses terminal ids to find the owning v2 pane", () => {
		const target = resolveV2NotificationTarget({
			workspaceId: WORKSPACE_ID,
			payload: payload({ terminalId: "terminal-1" }),
			paneLayout: layout,
		});

		expect(target).toMatchObject({
			workspaceId: WORKSPACE_ID,
			tabId: "tab-active",
			paneId: "pane-terminal",
			sourceId: "terminal-1",
			terminalId: "terminal-1",
		});
	});

	it("uses chat session ids to find the owning v2 pane", () => {
		const target = resolveV2NotificationTarget({
			workspaceId: WORKSPACE_ID,
			payload: payload({ resourceId: "chat-2" }),
			paneLayout: layout,
		});

		expect(target).toMatchObject({
			workspaceId: WORKSPACE_ID,
			tabId: "tab-background",
			paneId: "pane-chat-background",
			sourceId: "chat-2",
			chatSessionId: "chat-2",
		});
	});

	it("falls back to a source-only target when no pane matches", () => {
		const target = resolveV2NotificationTarget({
			workspaceId: WORKSPACE_ID,
			payload: payload({ terminalId: "terminal-missing" }),
			paneLayout: layout,
		});

		expect(target).toEqual({
			workspaceId: WORKSPACE_ID,
			sourceId: "terminal-missing",
			terminalId: "terminal-missing",
		});
	});

	it("only reports visible for the active tab and active pane", () => {
		const terminalTarget = resolveTerminalTarget({
			workspaceId: WORKSPACE_ID,
			terminalId: "terminal-1",
			paneLayout: layout,
		});
		const backgroundTarget = resolveV2NotificationTarget({
			workspaceId: WORKSPACE_ID,
			payload: payload({ sessionId: "chat-2" }),
			paneLayout: layout,
		});

		expect(terminalTarget).not.toBeNull();
		if (!terminalTarget) return;

		expect(
			isV2NotificationTargetVisible({
				currentWorkspaceId: WORKSPACE_ID,
				paneLayout: layout,
				target: terminalTarget,
			}),
		).toBe(true);
		expect(
			isV2NotificationTargetVisible({
				currentWorkspaceId: WORKSPACE_ID,
				paneLayout: layout,
				target: backgroundTarget,
			}),
		).toBe(false);
	});

	it("prefers stable runtime ids over legacy pane ids for status keys", () => {
		expect(
			getNotificationSourceId(
				payload({ paneId: "legacy-pane", terminalId: "terminal-1" }),
			),
		).toBe("terminal-1");
	});
});
