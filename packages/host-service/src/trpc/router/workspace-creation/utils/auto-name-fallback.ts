import {
	deriveWorkspaceBranchFromPrompt,
	deriveWorkspaceTitleFromPrompt,
	generateFriendlyBranchName,
} from "@superset/shared/workspace-launch";

/**
 * Picks the branch name for an auto-generated (no typed branch) workspace.
 *
 * The AI-generated name wins when available. When AI naming is unavailable
 * (missing credentials, timeout, generation failure) we still have the user's
 * initial prompt in hand, so derive a slug from it — a prompt-shaped branch
 * like `ui-changes-after-qa` beats a random `interesting-forest`. The friendly
 * random name is the last resort, only when there is no prompt to derive from.
 */
export function resolveAutoBranchName(
	aiBranchName: string | null | undefined,
	prompt: string,
): string {
	if (aiBranchName) return aiBranchName;
	const derived = deriveWorkspaceBranchFromPrompt(prompt);
	if (derived) return derived;
	return generateFriendlyBranchName();
}

/**
 * Picks the workspace title for an auto-generated workspace, mirroring
 * {@link resolveAutoBranchName}: AI title first, then a prompt-derived title,
 * then `null` so the caller can fall back to the branch name.
 */
export function resolveAutoTitle(
	aiTitle: string | null | undefined,
	prompt: string,
): string | null {
	if (aiTitle) return aiTitle;
	return deriveWorkspaceTitleFromPrompt(prompt) || null;
}
