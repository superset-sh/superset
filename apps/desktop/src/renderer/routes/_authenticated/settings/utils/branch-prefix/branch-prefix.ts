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
