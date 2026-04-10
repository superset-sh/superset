/**
 * Branch name sanitization + deduplication utilities.
 * Copied from apps/desktop/src/shared/utils/branch.ts to avoid a
 * cross-package dependency. Keep in sync with the original.
 */

const SEGMENT_MAX_LENGTH = 50;
const BRANCH_MAX_LENGTH = 100;

function sanitizeSegment(text: string, maxLength = SEGMENT_MAX_LENGTH): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9._+@-]/g, "")
		.replace(/\.{2,}/g, ".")
		.replace(/@\{/g, "@")
		.replace(/-+/g, "-")
		.replace(/^[-.]|[-.]+$/g, "")
		.replace(/\.lock$/g, "")
		.slice(0, maxLength);
}

function sanitizeBranchName(name: string): string {
	return name
		.split("/")
		.map((s) => sanitizeSegment(s))
		.filter(Boolean)
		.join("/");
}

export function sanitizeBranchNameWithMaxLength(
	name: string,
	maxLength = BRANCH_MAX_LENGTH,
): string {
	const sanitized = sanitizeBranchName(name);
	return sanitized.slice(0, maxLength).replace(/\/+$/g, "");
}

/**
 * Appends `-2`, `-3`, etc. until the name doesn't collide with
 * any existing branch (case-insensitive).
 */
export function deduplicateBranchName(
	candidate: string,
	existingBranchNames: string[],
): string {
	if (!candidate) return candidate;

	const existingSet = new Set(existingBranchNames.map((b) => b.toLowerCase()));
	if (!existingSet.has(candidate.toLowerCase())) return candidate;

	for (let suffix = 2; suffix < 10_000; suffix++) {
		const deduplicated = `${candidate}-${suffix}`;
		if (!existingSet.has(deduplicated.toLowerCase())) return deduplicated;
	}

	return `${candidate}-${Date.now()}`;
}
