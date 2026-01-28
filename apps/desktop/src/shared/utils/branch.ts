export function sanitizeSegment(text: string, maxLength = 50): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
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
	switch (mode) {
		case "none":
			return null;
		case "custom":
			return customPrefix || null;
		case "author":
			return authorPrefix || null;
		case "github":
			return githubUsername || authorPrefix || null;
		default:
			return null;
	}
}
