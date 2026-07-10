import { sanitizeUserBranchName } from "@superset/shared/workspace-launch";
import type { DashboardNewWorkspaceDraft } from "../../../../../DashboardNewWorkspaceDraftContext";

interface ResolvedNames {
	/** User-typed (sanitized) branch, or null when not typed. */
	branchName: string | null;
	/** User-typed workspace name, or null when not typed. */
	workspaceName: string | null;
}

/**
 * Returns whatever the user typed; null otherwise. The host-service
 * generates a friendly random for the missing side and runs the AI
 * rename for any side that wasn't user-supplied.
 */
export function resolveNames(draft: DashboardNewWorkspaceDraft): ResolvedNames {
	const branchName =
		draft.branchNameEdited && draft.branchName.trim()
			? sanitizeUserBranchName(draft.branchName.trim())
			: null;

	const workspaceName =
		draft.workspaceNameEdited && draft.workspaceName.trim()
			? draft.workspaceName.trim()
			: null;

	return { branchName, workspaceName };
}
