import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { BranchPrefixMode } from "@superset/local-db";

export const BRANCH_PREFIX_MODE_LABELS: Record<BranchPrefixMode, string> = {
	none: "No prefix",
	github: "GitHub username",
	author: "Git author name",
	custom: "Custom prefix",
};

export const BRANCH_PREFIX_MODE_LABELS_WITH_DEFAULT: Record<
	BranchPrefixMode | "default",
	string
> = {
	default: "Use global default",
	...BRANCH_PREFIX_MODE_LABELS,
};

export const BRANCH_PREFIX_MODE_MESSAGES: Record<
	BranchPrefixMode,
	MessageDescriptor
> = {
	none: msg({ id: "settings.branchPrefix.modeNone", message: "No prefix" }),
	github: msg({
		id: "settings.branchPrefix.modeGithub",
		message: "GitHub username",
	}),
	author: msg({
		id: "settings.branchPrefix.modeAuthor",
		message: "Git author name",
	}),
	custom: msg({
		id: "settings.branchPrefix.modeCustom",
		message: "Custom prefix",
	}),
};

export const BRANCH_PREFIX_MODE_MESSAGES_WITH_DEFAULT: Record<
	BranchPrefixMode | "default",
	MessageDescriptor
> = {
	default: msg({
		id: "settings.branchPrefix.modeDefault",
		message: "Use global default",
	}),
	...BRANCH_PREFIX_MODE_MESSAGES,
};
