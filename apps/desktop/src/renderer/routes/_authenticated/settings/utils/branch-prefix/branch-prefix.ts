import type { BranchPrefixMode } from "@superset/local-db";

export const BRANCH_PREFIX_MODE_LABELS: Record<BranchPrefixMode, string> = {
	github: "GitHub username",
	author: "Git author name",
	custom: "Custom prefix",
	none: "No prefix",
};

export const BRANCH_PREFIX_MODE_LABELS_WITH_DEFAULT: Record<
	BranchPrefixMode | "default",
	string
> = {
	default: "Use global default",
	...BRANCH_PREFIX_MODE_LABELS,
};

export function sanitizePrefix(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 50);
}
