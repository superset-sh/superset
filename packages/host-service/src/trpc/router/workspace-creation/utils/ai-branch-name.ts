import { deriveWorkspaceBranchFromPrompt } from "@superset/shared/workspace-launch";
import { deduplicateBranchName } from "./sanitize-branch";

/**
 * Branch name derived from the prompt text — no model, no network. Callers
 * that can supply the launch agent should use
 * `generateWorkspaceNamesFromPrompt` instead, which tries the agent's own
 * CLI first and only falls back to this shape of slug.
 */
export function generateBranchNameFromPrompt(
	prompt: string,
	existingBranches: string[],
): string | null {
	const derived = deriveWorkspaceBranchFromPrompt(prompt);
	if (!derived) return null;
	return deduplicateBranchName(derived, existingBranches);
}
