import { describe, expect, it } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import {
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
				"pane-terminal-hidden": {
					id: "pane-terminal-hidden",
					kind: "terminal",
					data: { terminalId: "terminal-hidden" },
				},
			},
		},
		{
			id: "tab-background",
			createdAt: 2,
			activePaneId: "pane-terminal-background",
			layout: { type: "pane", paneId: "pane-terminal-background" },
			panes: {
				"pane-terminal-background": {
					id: "pane-terminal-background",
					kind: "terminal",
					data: { terminalId: "terminal-2" },
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
			terminalId: "terminal-1",
		});
	});

	it("falls back to a terminal-only target when no pane matches", () => {
		const target = resolveV2NotificationTarget({
			workspaceId: WORKSPACE_ID,
			payload: payload({ terminalId: "terminal-missing" }),
			paneLayout: layout,
		});

		expect(target).toEqual({
			workspaceId: WORKSPACE_ID,
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
			payload: payload({ terminalId: "terminal-2" }),
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
});
