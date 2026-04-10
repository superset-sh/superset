import { sanitizeUserBranchName, slugifyForBranch } from "shared/utils/branch";
import { generateFriendlyBranchName } from "shared/utils/friendly-branch-name";
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
 * - Branch: user-typed (sanitized) > prompt slug > friendly random
 * - Workspace: user-typed > prompt text > same as branch
 */
export function resolveNames(draft: DashboardNewWorkspaceDraft): ResolvedNames {
	const trimmedPrompt = draft.prompt.trim();
	const friendlyFallback = generateFriendlyBranchName();

	const branchName =
		draft.branchNameEdited && draft.branchName.trim()
			? sanitizeUserBranchName(draft.branchName.trim())
			: trimmedPrompt
				? slugifyForBranch(trimmedPrompt)
				: friendlyFallback;

	const workspaceName =
		draft.workspaceNameEdited && draft.workspaceName.trim()
			? draft.workspaceName.trim()
			: trimmedPrompt || friendlyFallback;

	return { branchName, workspaceName };
}
