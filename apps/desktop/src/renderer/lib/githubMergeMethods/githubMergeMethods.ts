import {
	GITHUB_MERGE_METHODS,
	type GitHubMergeCapabilities,
	type GitHubMergeMethod,
	isGitHubMergeMethodDisabled,
} from "@superset/shared/github-merge-methods";

export const MERGE_METHODS = GITHUB_MERGE_METHODS;

export type MergeMethod = GitHubMergeMethod;

export interface GitHubMergeSettings extends GitHubMergeCapabilities {
	viewerDefaultMergeMethod?: string | null;
}

export const MERGE_METHOD_LABELS: Record<MergeMethod, string> = {
	merge: "Create merge commit",
	rebase: "Rebase and merge",
	squash: "Squash and merge",
};

function hasCompleteMergeSettings(
	settings: GitHubMergeSettings | null | undefined,
): settings is GitHubMergeSettings & {
	allowMergeCommit: boolean;
	allowRebaseMerge: boolean;
	allowSquashMerge: boolean;
} {
	return (
		typeof settings?.allowMergeCommit === "boolean" &&
		typeof settings.allowRebaseMerge === "boolean" &&
		typeof settings.allowSquashMerge === "boolean"
	);
}

function normalizeMergeMethod(
	value: string | null | undefined,
): MergeMethod | null {
	const normalized = value?.toLowerCase();
	return normalized === "merge" ||
		normalized === "rebase" ||
		normalized === "squash"
		? normalized
		: null;
}

/**
 * Returns the methods that GitHub allows, with the viewer's default first
 * when it is available. An incomplete response is treated as unavailable so
 * a transient settings failure never removes the merge menu options.
 */
export function getAvailableMergeMethods(
	settings: GitHubMergeSettings | null | undefined,
): MergeMethod[] {
	if (!hasCompleteMergeSettings(settings)) {
		return [...MERGE_METHODS];
	}

	const availableMethods = MERGE_METHODS.filter((method) => {
		return !isGitHubMergeMethodDisabled(settings, method);
	});
	const defaultMethod = normalizeMergeMethod(settings.viewerDefaultMergeMethod);

	if (!defaultMethod || !availableMethods.includes(defaultMethod)) {
		return availableMethods;
	}

	return [
		defaultMethod,
		...availableMethods.filter((method) => method !== defaultMethod),
	];
}
