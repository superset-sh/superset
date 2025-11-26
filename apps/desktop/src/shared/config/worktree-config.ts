import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Worktree configuration
 *
 * Centralized configuration for worktree paths and setup.json management.
 *
 * Migration from old to new structure:
 * - OLD: <mainRepoPath>/.superset/<worktree-name>/
 * - NEW: ~/.superset/worktrees/superset/<worktree-name>/
 *
 * Each worktree gets its own setup.json at:
 * ~/.superset/worktrees/superset/<worktree-name>/setup.json
 */

/**
 * Base directory for all worktrees
 * Can be overridden with SUP_WORKTREE_ROOT environment variable
 *
 * Default: ~/.superset/worktrees/superset
 */
export function getWorktreeRoot(): string {
	// Check environment variable first
	const envRoot = process.env.SUP_WORKTREE_ROOT;
	if (envRoot) {
		return envRoot;
	}

	// Default to ~/.superset/worktrees/superset
	return join(homedir(), ".superset", "worktrees", "superset");
}

/**
 * Get the full path for a worktree
 * @param worktreeName - Name of the worktree (e.g., branch name)
 * @returns Full path to the worktree directory
 */
export function getWorktreePath(worktreeName: string): string {
	return join(getWorktreeRoot(), worktreeName);
}

/**
 * Get the path to setup.json for a worktree
 * @param worktreeName - Name of the worktree (e.g., branch name)
 * @returns Full path to the worktree's setup.json
 */
export function getWorktreeSetupPath(worktreeName: string): string {
	return join(getWorktreePath(worktreeName), "setup.json");
}

/**
 * Legacy path builder for backwards compatibility
 * @param mainRepoPath - Path to the main repository
 * @param worktreeName - Name of the worktree
 * @returns Path using the old structure: <mainRepoPath>/.superset/<worktreeName>
 * @deprecated Use getWorktreePath() instead
 */
export function getLegacyWorktreePath(
	mainRepoPath: string,
	worktreeName: string,
): string {
	return join(mainRepoPath, ".superset", worktreeName);
}

/**
 * Check if we should use legacy paths (for migration/fallback)
 * Returns true if SUP_USE_LEGACY_PATHS=true
 */
export function shouldUseLegacyPaths(): boolean {
	return process.env.SUP_USE_LEGACY_PATHS === "true";
}

/**
 * Log a warning about using legacy worktree paths
 * @param legacyPath - The legacy path being used
 * @param newPath - The new path that should be used
 */
export function warnAboutLegacyPath(legacyPath: string, newPath: string): void {
	console.warn("[worktree-config] ⚠️  Using legacy worktree path");
	console.warn(`  Legacy: ${legacyPath}`);
	console.warn(`  New:    ${newPath}`);
	console.warn(
		"  Consider migrating to the new worktree structure at ~/.superset/worktrees/superset/",
	);
	console.warn(
		"  To continue using legacy paths, set SUP_USE_LEGACY_PATHS=true",
	);
}
