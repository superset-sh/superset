import {
	DEFAULT_BRANCH_SEGMENT_MAX_LENGTH,
	sanitizeBranchNameWithMaxLength,
	sanitizeSegment,
} from "./branch";

export const DEFAULT_WORKSPACE_TITLE_MAX_LENGTH = 100;

/**
 * Normalized workspace title (for display/storage), derived from a free-form prompt.
 * This does not mutate the actual agent prompt.
 */
export function deriveWorkspaceTitleFromPrompt(
	prompt: string,
	maxLength = DEFAULT_WORKSPACE_TITLE_MAX_LENGTH,
): string {
	return prompt.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * Generates a branch slug from prompt text and applies branch naming constraints.
 */
export function deriveWorkspaceBranchFromPrompt(
	prompt: string,
	segmentMaxLength = DEFAULT_BRANCH_SEGMENT_MAX_LENGTH,
): string {
	const generatedSlug = sanitizeSegment(prompt, segmentMaxLength);
	return sanitizeBranchNameWithMaxLength(generatedSlug);
}
