import { access, lstat, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

/** Maximum depth to scan for nested repos */
const MAX_SCAN_DEPTH = 5;

/** Directories to exclude from scanning */
const EXCLUDED_DIRS = new Set([
	"node_modules",
	"vendor",
	"dist",
	"build",
	".git",
	"__pycache__",
	".venv",
	"venv",
	".next",
	".turbo",
	"target",
	"coverage",
]);

/** Cache TTL in milliseconds (30 seconds) */
const CACHE_TTL = 30_000;

interface CacheEntry {
	repos: string[];
	timestamp: number;
}

const repoCache = new Map<string, CacheEntry>();

/**
 * Check if a directory contains a .git directory (is a git repo)
 */
async function isGitRepo(dirPath: string): Promise<boolean> {
	try {
		const gitPath = join(dirPath, ".git");
		await access(gitPath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Recursively find all nested git repositories within a directory.
 * Uses breadth-first search with depth limiting.
 */
async function findNestedReposRecursive({
	basePath,
	currentPath,
	depth,
	results,
}: {
	basePath: string;
	currentPath: string;
	depth: number;
	results: string[];
}): Promise<void> {
	if (depth > MAX_SCAN_DEPTH) return;

	try {
		const entries = await readdir(currentPath, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (EXCLUDED_DIRS.has(entry.name)) continue;

			const entryPath = join(currentPath, entry.name);

			// Skip if it's a symlink (security: prevent escaping worktree)
			try {
				const stats = await lstat(entryPath);
				if (stats.isSymbolicLink()) continue;
			} catch {
				continue;
			}

			// Check if this directory is a git repo
			if (await isGitRepo(entryPath)) {
				// Don't descend into nested repos, just record them
				results.push(entryPath);
			} else {
				// Recurse into subdirectories
				await findNestedReposRecursive({
					basePath,
					currentPath: entryPath,
					depth: depth + 1,
					results,
				});
			}
		}
	} catch {
		// Silently skip directories we can't read
	}
}

/**
 * Detects nested git repositories within a worktree.
 *
 * @param worktreePath - The root worktree path
 * @returns Array of absolute paths to git repositories, root first
 */
export async function detectNestedRepos(
	worktreePath: string,
): Promise<string[]> {
	// Check cache first
	const cached = repoCache.get(worktreePath);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.repos;
	}

	const repos: string[] = [];

	// Always include root if it's a git repo
	if (await isGitRepo(worktreePath)) {
		repos.push(worktreePath);
	}

	// Find nested repos
	await findNestedReposRecursive({
		basePath: worktreePath,
		currentPath: worktreePath,
		depth: 1,
		results: repos,
	});

	// Update cache
	repoCache.set(worktreePath, {
		repos,
		timestamp: Date.now(),
	});

	return repos;
}

/**
 * Get a display name for a nested repo relative to the worktree root.
 *
 * @param worktreePath - The root worktree path
 * @param repoPath - The absolute path to the nested repo
 * @returns Display name like "(root)" or "packages/submodule"
 */
export function getRepoDisplayName(
	worktreePath: string,
	repoPath: string,
): string {
	if (repoPath === worktreePath) {
		return "(root)";
	}
	return relative(worktreePath, repoPath);
}

/**
 * Clear the nested repos cache for a specific worktree or all worktrees.
 */
export function clearNestedReposCache(worktreePath?: string): void {
	if (worktreePath) {
		repoCache.delete(worktreePath);
	} else {
		repoCache.clear();
	}
}
