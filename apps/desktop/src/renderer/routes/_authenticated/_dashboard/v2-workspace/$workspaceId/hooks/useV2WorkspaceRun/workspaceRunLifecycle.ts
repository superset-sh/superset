import type { TerminalLifecyclePayload } from "@superset/workspace-client";
import type { WorkspaceRunTerminalState } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

export function markStopped(
	state: WorkspaceRunTerminalState,
	stoppedAt: number,
	overrides?: Partial<
		Pick<WorkspaceRunTerminalState, "exitCode" | "signal" | "state">
	>,
) {
	state.state =
		overrides?.state ??
		(state.stopRequestedAt ? "stopped-by-user" : "stopped-by-exit");
	state.stoppedAt = stoppedAt;
	if (overrides?.exitCode !== undefined) state.exitCode = overrides.exitCode;
	if (overrides?.signal !== undefined) state.signal = overrides.signal;
}

export function applyWorkspaceRunLifecycleEvent(
	states: Record<string, WorkspaceRunTerminalState>,
	payload: TerminalLifecyclePayload,
): void {
	if (
		payload.eventType !== "exit" &&
		payload.eventType !== "command-finished"
	) {
		return;
	}
	const state = states[payload.terminalId];
	if (!state || state.state !== "running") return;
	markStopped(
		state,
		payload.occurredAt,
		payload.eventType === "exit"
			? { exitCode: payload.exitCode, signal: payload.signal }
			: undefined,
	);
}
