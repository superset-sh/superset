import { describe, expect, it } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { getV2NativeNotificationContent } from "./notificationContent";

const layout: WorkspaceState<PaneViewerData> = {
	version: 1,
	activeTabId: "tab-1",
	tabs: [
		{
			id: "tab-1",
			titleOverride: "Backend",
			createdAt: 1,
			activePaneId: "pane-1",
			layout: { type: "pane", paneId: "pane-1" },
			panes: {
				"pane-1": {
					id: "pane-1",
					kind: "terminal",
					titleOverride: "Test runner",
					data: { terminalId: "terminal-1" },
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
		terminalId: "terminal-1",
		occurredAt: 1,
		...overrides,
	};
}

describe("getV2NativeNotificationContent", () => {
	it("includes agent, workspace, pane, and tab labels for completion", () => {
		expect(
			getV2NativeNotificationContent({
				workspaceName: "Improve notifications",
				payload: payload({
					agent: { agentId: "codex", sessionId: "session-1" },
				}),
				target: {
					workspaceId: "workspace-1",
					tabId: "tab-1",
					paneId: "pane-1",
					terminalId: "terminal-1",
				},
				paneLayout: layout,
			}),
		).toEqual({
			title: "Agent Complete - Codex",
			body: "Workspace: Improve notifications | Pane: Test runner | Tab: Backend",
		});
	});

	it("uses needs-input copy for permission requests", () => {
		expect(
			getV2NativeNotificationContent({
				workspaceName: "Improve notifications",
				payload: payload({
					eventType: "PermissionRequest",
					agent: { agentId: "claude" },
				}),
				target: {
					workspaceId: "workspace-1",
					tabId: "tab-1",
					paneId: "pane-1",
					terminalId: "terminal-1",
				},
				paneLayout: layout,
			}),
		).toMatchObject({
			title: "Agent Needs Input - Claude",
			body: "Workspace: Improve notifications | Pane: Test runner | Tab: Backend",
		});
	});

	it("falls back to runtime terminal title and short terminal id", () => {
		expect(
			getV2NativeNotificationContent({
				workspaceName: " ",
				payload: payload({ agent: { agentId: "droid" } }),
				target: {
					workspaceId: "workspace-1",
					terminalId: "terminal-long-id",
				},
				paneLayout: null,
				terminalTitle: "deploy script",
			}),
		).toEqual({
			title: "Agent Complete - Droid",
			body: "Workspace: Workspace | Pane: deploy script",
		});

		expect(
			getV2NativeNotificationContent({
				workspaceName: "",
				payload: payload({ agent: undefined }),
				target: {
					workspaceId: "workspace-1",
					terminalId: "terminal-long-id",
				},
				paneLayout: null,
			}),
		).toMatchObject({
			title: "Agent Complete",
			body: "Workspace: Workspace | Pane: Terminal long-id",
		});
	});
});
