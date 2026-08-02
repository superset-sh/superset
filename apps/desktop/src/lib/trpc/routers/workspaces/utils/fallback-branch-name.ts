import {
	deduplicateBranchName,
	deriveWorkspaceBranchFromPrompt,
	sanitizeBranchNameWithMaxLength,
} from "@superset/shared/workspace-launch";

/**
 * Branch name for an auto-generated workspace (no typed branch) when AI naming
 * is unavailable. Prefer a slug derived from the user's prompt — a prompt-shaped
 * `ui-changes-after-qa` beats a random `interesting-forest`. Returns `null` when
 * there's no prompt to derive from so the caller can fall back to a random
 * friendly name (#5825).
 */
export function resolvePromptBranchName({
	prompt,
	existingBranches,
	addPrefix,
}: {
	prompt: string | undefined | null;
	existingBranches: string[];
	addPrefix: (name: string) => string;
}): string | null {
	const slug = prompt?.trim() ? deriveWorkspaceBranchFromPrompt(prompt) : "";
	if (!slug) return null;
	return deduplicateBranchName(
		sanitizeBranchNameWithMaxLength(addPrefix(slug)),
		existingBranches,
	);
}
