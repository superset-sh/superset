export interface AutomationRunWorkspaceCleanupTarget {
	runId: string;
	automationId: string;
	organizationId: string;
	ownerUserId: string;
	ownerEmail: string | null;
	hostId: string | null;
	workspaceId: string | null;
	automationWorkspaceId: string | null;
}

export type AutomationRunWorkspaceCleanupDecision =
	| { shouldCleanup: true }
	| { shouldCleanup: false; reason: string };

export interface AutomationRunWorkspaceCleanupResult {
	status: "cleaned" | "skipped" | "failed";
	reason?: string;
	warnings?: string[];
}

export function decideAutomationRunWorkspaceCleanup(
	target: AutomationRunWorkspaceCleanupTarget,
): AutomationRunWorkspaceCleanupDecision {
	if (!target.hostId) {
		return { shouldCleanup: false, reason: "run has no host" };
	}
	if (!target.workspaceId) {
		return { shouldCleanup: false, reason: "run has no workspace" };
	}
	if (target.automationWorkspaceId) {
		return {
			shouldCleanup: false,
			reason: "automation is configured to reuse a workspace",
		};
	}
	return { shouldCleanup: true };
}
