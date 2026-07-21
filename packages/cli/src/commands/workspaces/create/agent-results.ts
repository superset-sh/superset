import { CLIError } from "@superset/cli-framework";

interface WorkspaceAgentResult {
	ok: boolean;
	error?: string;
}

interface WorkspaceCreateAgentSummary {
	workspace: { id: string; name: string };
	alreadyExists: boolean;
	agents: WorkspaceAgentResult[];
}

/**
 * Workspace creation intentionally survives an agent launch failure, but the
 * CLI must not turn that partial success into exit 0. Keep that policy at the
 * command boundary: the host returns structured per-agent results so desktop
 * callers can choose their own UX, while scripts get a truthful failure and
 * the workspace ID needed to retry with `agents create`.
 */
export function assertRequestedAgentsStarted(
	result: WorkspaceCreateAgentSummary,
	expectedCount: number,
): void {
	if (expectedCount === 0) return;

	const failures = result.agents.filter((agent) => !agent.ok);
	const missingCount = Math.max(0, expectedCount - result.agents.length);
	if (failures.length === 0 && missingCount === 0) return;

	const requestedLabel = expectedCount === 1 ? "agent" : "agents";
	const action = result.alreadyExists ? "reused" : "created";
	const details = [
		...failures.map((failure) => failure.error ?? "Unknown launch error"),
		...(missingCount > 0
			? [`Host returned no result for ${missingCount} requested launch(es).`]
			: []),
	];
	throw new CLIError(
		`Workspace "${result.workspace.name}" was ${action}, but the requested ${requestedLabel} failed to start`,
		`Workspace ID: ${result.workspace.id}. ${details.join(" ")} Retry with: superset agents create --workspace ${result.workspace.id} --agent <id> --prompt <text>`,
	);
}
