import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { BranchPrefixMode } from "@superset/local-db";

export const BRANCH_PREFIX_MODE_MESSAGES: Record<
	BranchPrefixMode,
	MessageDescriptor
> = {
	none: msg({ message: "No prefix" }),
	github: msg({
		message: "GitHub username",
	}),
	author: msg({
		message: "Git author name",
	}),
	custom: msg({
		message: "Custom prefix",
	}),
};

export const BRANCH_PREFIX_MODE_MESSAGES_WITH_DEFAULT: Record<
	BranchPrefixMode | "default",
	MessageDescriptor
> = {
	default: msg({
		message: "Use global default",
	}),
	...BRANCH_PREFIX_MODE_MESSAGES,
};
