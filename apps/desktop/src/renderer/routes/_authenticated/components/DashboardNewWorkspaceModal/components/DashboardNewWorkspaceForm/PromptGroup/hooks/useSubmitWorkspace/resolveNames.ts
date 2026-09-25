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
 * seeds the branch from a typed name, otherwise creates with a friendly
 * random and applies AI names as a deferred rename.
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
