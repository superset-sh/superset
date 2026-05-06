export const DEFAULT_BRANCH_SEGMENT_MAX_LENGTH = 50;
export const DEFAULT_BRANCH_NAME_MAX_LENGTH = 100;

interface SanitizeSegmentOptions {
	preserveCase?: boolean;
}

interface SanitizeBranchNameOptions {
	preserveFirstSegmentCase?: boolean;
	preserveCase?: boolean;
}

export function sanitizeSegment(
	text: string,
	maxLength = DEFAULT_BRANCH_SEGMENT_MAX_LENGTH,
	{ preserveCase = false }: SanitizeSegmentOptions = {},
): string {
	const normalized = preserveCase ? text : text.toLowerCase();
	const allowedCharacters = preserveCase
		? /[^a-zA-Z0-9._+@-]/g
		: /[^a-z0-9._+@-]/g;

	return normalized
		.trim()
		.replace(/\s+/g, "-")
		.replace(allowedCharacters, "")
		.replace(/\.{2,}/g, ".")
		.replace(/@\{/g, "@")
		.replace(/-+/g, "-")
		.replace(/^[-.]|[-.]+$/g, "")
		.replace(/\.lock$/g, "")
		.slice(0, maxLength);
}

export function sanitizeAuthorPrefix(name: string): string {
	return sanitizeSegment(name, DEFAULT_BRANCH_SEGMENT_MAX_LENGTH, {
		preserveCase: true,
	});
}

export function sanitizeBranchName(
	name: string,
	{
		preserveFirstSegmentCase = false,
		preserveCase = false,
	}: SanitizeBranchNameOptions = {},
): string {
	return name
		.split("/")
		.map((segment, index) =>
			sanitizeSegment(segment, DEFAULT_BRANCH_SEGMENT_MAX_LENGTH, {
				preserveCase: preserveCase || (preserveFirstSegmentCase && index === 0),
			}),
		)
		.filter(Boolean)
		.join("/");
}

export function truncateBranchName(
	branchName: string,
	maxLength = DEFAULT_BRANCH_NAME_MAX_LENGTH,
): string {
	return branchName.slice(0, maxLength).replace(/\/+$/g, "");
}

export function sanitizeBranchNameWithMaxLength(
	name: string,
	maxLength = DEFAULT_BRANCH_NAME_MAX_LENGTH,
	options?: SanitizeBranchNameOptions,
): string {
	return truncateBranchName(sanitizeBranchName(name, options), maxLength);
}

/**
 * Returns a branch name that does not collide with existing names.
 * If the candidate already exists, appends numeric suffixes (-1, -2, ...)
 * to the last path segment until an available name is found.
 */
export function deduplicateBranchName(
	candidate: string,
	existingBranchNames: string[],
): string {
	const normalizedCandidate = candidate.trim();
	if (!normalizedCandidate) {
		return normalizedCandidate;
	}

	const existingSet = new Set(existingBranchNames.map((b) => b.toLowerCase()));
	if (!existingSet.has(normalizedCandidate.toLowerCase())) {
		return normalizedCandidate;
	}

	const segments = normalizedCandidate.split("/");
	const lastSegment = segments.at(-1) ?? normalizedCandidate;
	const prefix = segments.slice(0, -1).join("/");

	const strippedBase = lastSegment.replace(/-\d+$/, "");
	const baseSegment = strippedBase || lastSegment;
	const append = (suffix: number) =>
		prefix ? `${prefix}/${baseSegment}-${suffix}` : `${baseSegment}-${suffix}`;

	for (let suffix = 1; suffix < 10_000; suffix++) {
		const deduplicated = append(suffix);
		if (!existingSet.has(deduplicated.toLowerCase())) {
			return deduplicated;
		}
	}

	return prefix
		? `${prefix}/${baseSegment}-${Date.now()}`
		: `${baseSegment}-${Date.now()}`;
}

const MAX_BRANCH_LENGTH = 100;

/**
 * Turns arbitrary text (a prompt, a title) into a branch-name-shaped slug.
 * Lowercases, replaces spaces with dashes, strips special chars.
 * Use this when the input is NOT a branch name — it's a sentence.
 */
export function slugifyForBranch(
	text: string,
	maxLength = MAX_BRANCH_LENGTH,
): string {
	const slug = text
		.toLowerCase()
		.trim()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9._/-]/g, "")
		.replace(/\.{2,}/g, ".")
		.replace(/-+/g, "-")
		.replace(/^[-.]|[-.]+$/g, "")
		.replace(/\.lock$/g, "")
		.slice(0, maxLength)
		.replace(/[-.]+$/g, "");
	return slug;
}

/**
 * Strips only what git forbids from a user-typed branch name.
 * Preserves case, slashes, underscores — respects user intent.
 * Use this when the input IS a branch name the user explicitly typed.
 *
 * Git ref rules: no `..`, no ASCII control chars, no `~^:?*[\`,
 * no trailing `.` or `.lock`, no leading `-`.
 */
export function sanitizeUserBranchName(
	name: string,
	maxLength = MAX_BRANCH_LENGTH,
): string {
	const cleaned = name
		.trim()
		.replace(/\.\./g, ".") // no ..
		.replace(/[~^:?*[\]\\]/g, "") // no ~^:?*[\]
		// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars intentionally
		.replace(/[\x00-\x1f\x7f]/g, "") // no control chars
		.replace(/@\{/g, "@") // no @{
		.replace(/\.lock$/g, "") // no trailing .lock
		.replace(/^-/, "") // no leading -
		.replace(/\/+/g, "/") // collapse slashes
		.replace(/^\/|\/$/g, "") // no leading/trailing slash
		.slice(0, maxLength)
		.replace(/[-./]+$/g, ""); // strip trailing .- / after truncation
	return cleaned;
}

export function resolveBranchPrefix({
	mode,
	customPrefix,
	authorPrefix,
	githubUsername,
}: {
	mode: "github" | "author" | "custom" | "none" | null | undefined;
	customPrefix?: string | null;
	authorPrefix?: string | null;
	githubUsername?: string | null;
}): string | null {
	let prefix: string | null = null;
	switch (mode) {
		case "none":
			return null;
		case "custom":
			prefix = customPrefix || null;
			break;
		case "author":
			prefix = authorPrefix || null;
			break;
		case "github":
			prefix = githubUsername || authorPrefix || null;
			break;
		default:
			return null;
	}
	return prefix
		? sanitizeSegment(prefix, DEFAULT_BRANCH_SEGMENT_MAX_LENGTH, {
				preserveCase: true,
			})
		: null;
}
