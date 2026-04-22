import {
	generateFriendlyBranchName,
	sanitizeUserBranchName,
} from "@superset/shared/workspace-launch";
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
 * - Branch: user-typed (sanitized) > friendly random
 * - Workspace: user-typed > friendly random
 *
 * Prompt-based derivation is intentionally not used here — AI naming runs
 * post-create in host-service for the workspace title.
 */
export function resolveNames(draft: DashboardNewWorkspaceDraft): ResolvedNames {
	const friendlyFallback = generateFriendlyBranchName();

	const branchName =
		draft.branchNameEdited && draft.branchName.trim()
			? sanitizeUserBranchName(draft.branchName.trim())
			: friendlyFallback;

	const workspaceName =
		draft.workspaceNameEdited && draft.workspaceName.trim()
			? draft.workspaceName.trim()
			: friendlyFallback;

	return { branchName, workspaceName };
}
