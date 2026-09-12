import type { SubmitOutcome } from "renderer/stores/workspace-creates";

export interface BatchWorkspaceCreateFailures {
	/** Creates that produced no workspace at all. */
	notCreated: number;
	/** Creates whose workspace survived an agent that never launched. */
	agentFailed: number;
	/** The first host error of each kind; null when that kind did not occur. */
	firstNotCreatedError: string | null;
	firstAgentError: string | null;
}

/**
 * Splits a batch's outcomes by what actually failed.
 *
 * The two are not interchangeable in a report: a workspace whose agent failed
 * to launch is in the sidebar, checked out and usable, and counting it as a
 * create that did not happen tells the user to go looking for something that
 * is already there. `workspaceId` on the failure arm is what separates them —
 * the store sets it only when it kept the workspace.
 *
 * Returns null when nothing failed.
 */
export function summarizeBatchWorkspaceCreates(
	outcomes: readonly SubmitOutcome[],
): BatchWorkspaceCreateFailures | null {
	let notCreated = 0;
	let agentFailed = 0;
	let firstNotCreatedError: string | null = null;
	let firstAgentError: string | null = null;
	for (const outcome of outcomes) {
		if (outcome.ok) continue;
		if (outcome.workspaceId === undefined) {
			notCreated += 1;
			firstNotCreatedError ??= outcome.error;
			continue;
		}
		agentFailed += 1;
		firstAgentError ??= outcome.error;
	}
	if (notCreated === 0 && agentFailed === 0) return null;
	return { notCreated, agentFailed, firstNotCreatedError, firstAgentError };
}
