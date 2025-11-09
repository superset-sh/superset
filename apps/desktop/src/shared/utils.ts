import { author as _author, name } from "~/package.json";

const author = _author.name ?? _author;
const authorInKebabCase = author.replace(/\s+/g, "-");
const appId = `com.${authorInKebabCase}.${name}`.toLowerCase();

/**
 * @param {string} id
 * @description Create the app id using the name and author from package.json transformed to kebab case if the id is not provided.
 * @default 'com.{author}.{app}' - the author and app comes from package.json
 * @example
 * makeAppId('com.example.app')
 * // => 'com.example.app'
 */
export function makeAppId(id: string = appId): string {
	return id;
}

/**
 * Format a date as relative time (e.g., "2 hours ago", "3 days ago")
 */
export function formatRelativeTime(date: Date | string): string {
	const now = new Date();
	const then = typeof date === "string" ? new Date(date) : date;
	const diffMs = now.getTime() - then.getTime();
	const diffSecs = Math.floor(diffMs / 1000);
	const diffMins = Math.floor(diffSecs / 60);
	const diffHours = Math.floor(diffMins / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSecs < 60) {
		return "just now";
	}
	if (diffMins < 60) {
		return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
	}
	if (diffHours < 24) {
		return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
	}
	if (diffDays < 7) {
		return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
	}
	if (diffDays < 30) {
		const weeks = Math.floor(diffDays / 7);
		return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
	}
	if (diffDays < 365) {
		const months = Math.floor(diffDays / 30);
		return `${months} month${months === 1 ? "" : "s"} ago`;
	}
	const years = Math.floor(diffDays / 365);
	return `${years} year${years === 1 ? "" : "s"} ago`;
}

/**
 * Format a worktree path to show it relative to the repo root
 * @param worktreePath - Full path to the worktree
 * @param repoPath - Full path to the repository root
 * @returns Simplified path like ".superset/worktrees/super-5"
 */
export function formatWorktreePath(
	worktreePath: string,
	repoPath: string,
): string {
	// If the worktree path starts with the repo path, make it relative
	if (worktreePath.startsWith(repoPath)) {
		const relativePath = worktreePath.slice(repoPath.length);
		// Remove leading slash if present
		return relativePath.startsWith("/")
			? relativePath.slice(1)
			: relativePath;
	}
	// Otherwise return the full path
	return worktreePath;
}
