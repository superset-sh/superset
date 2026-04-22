import { sanitizeUserBranchName } from "@superset/shared/workspace-launch";
import type { DashboardNewWorkspaceDraft } from "../../../../../DashboardNewWorkspaceDraftContext";

interface ResolvedNames {
	branchName: string;
	workspaceName: string;
}

/**
 * Resolves the branch name and workspace display name from draft state.
 * Pure function — no side effects, no hooks.
 *
 * Priority:
 * - Branch: user-typed (sanitized) > draft's friendly random
 * - Workspace: user-typed > draft's friendly random
 *
 * Prompt-based derivation is intentionally not used here — AI naming runs
 * post-create in host-service for the workspace title. The friendly name
 * lives on the draft so the picker preview matches what gets submitted.
 */
export function resolveNames(draft: DashboardNewWorkspaceDraft): ResolvedNames {
	const branchName =
		draft.branchNameEdited && draft.branchName.trim()
			? sanitizeUserBranchName(draft.branchName.trim())
			: draft.friendlyFallback;

	const workspaceName =
		draft.workspaceNameEdited && draft.workspaceName.trim()
			? draft.workspaceName.trim()
			: draft.friendlyFallback;

	return { branchName, workspaceName };
}
