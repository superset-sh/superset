import { expect, test } from "bun:test";
import type { WorkspaceRunTerminalState } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { applyWorkspaceRunLifecycleEvent } from "./workspaceRunLifecycle";

test("applies completion events to a run registered before session creation", () => {
	const terminalId = "terminal-id";
	const states: Record<string, WorkspaceRunTerminalState> = {
		[terminalId]: {
			terminalId,
			workspaceId: "workspace-id",
			state: "running",
			command: "true",
			definitionSource: "project-config",
			startedAt: 1,
			stopRequestedAt: 2,
		},
	};

	applyWorkspaceRunLifecycleEvent(states, {
		terminalId,
		eventType: "command-finished",
		occurredAt: 3,
	});

	expect(states[terminalId]).toMatchObject({
		state: "stopped-by-user",
		stoppedAt: 3,
	});
});
