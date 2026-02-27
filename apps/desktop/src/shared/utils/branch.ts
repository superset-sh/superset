export function sanitizeSegment(text: string, maxLength = 50): string {
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

export function sanitizeAuthorPrefix(name: string): string {
	return sanitizeSegment(name);
}

export function sanitizeBranchName(name: string): string {
	return name
		.split("/")
		.map((s) => sanitizeSegment(s))
		.filter(Boolean)
		.join("/");
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
	return prefix ? sanitizeSegment(prefix) : null;
}
