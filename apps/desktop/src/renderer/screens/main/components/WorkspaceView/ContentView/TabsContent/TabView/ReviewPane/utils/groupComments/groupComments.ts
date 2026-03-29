import type { PullRequestComment } from "@superset/local-db";

export interface CommentGroup {
	path: string | null;
	comments: PullRequestComment[];
}

/**
 * Groups pull request comments by their file path.
 *
 * @param comments - Array of pull request comments to group
 * @returns Array of comment groups, with general comments first (path: null),
 *          followed by file-specific groups sorted alphabetically by path
 */
export function groupComments(comments: PullRequestComment[]): CommentGroup[] {
	// Create a map to group comments by path
	const groupsMap = new Map<string | null, PullRequestComment[]>();

	// Group comments by path
	for (const comment of comments) {
		const path = comment.path ?? null;
		const existing = groupsMap.get(path);

		if (existing) {
			existing.push(comment);
		} else {
			groupsMap.set(path, [comment]);
		}
	}

	// Convert map to array of CommentGroup objects
	const groups: CommentGroup[] = [];

	// Add general comments first (path: null)
	const generalComments = groupsMap.get(null);
	if (generalComments) {
		groups.push({ path: null, comments: generalComments });
		groupsMap.delete(null);
	}

	// Add file-specific groups sorted alphabetically by path
	const sortedPaths = Array.from(groupsMap.keys()).sort();
	for (const path of sortedPaths) {
		const comments = groupsMap.get(path);
		if (comments) {
			groups.push({ path, comments });
		}
	}

	return groups;
}
