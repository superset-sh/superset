import type { projects } from "@superset/local-db";
import { settings } from "@superset/local-db";
import {
	branchPrefixCollides,
	sanitizeCustomBranchPrefix,
} from "@superset/shared/workspace-launch";
import { localDb } from "main/lib/local-db";
import { getBranchPrefix, sanitizeAuthorPrefix } from "./git";

type Project = typeof projects.$inferSelect;

/**
 * Resolves the branch prefix for a project, considering:
 * - Project-level overrides (if configured)
 * - Global settings (as fallback)
 * - Collision avoidance (if prefix matches existing branch)
 *
 * @param project - The project configuration
 * @param existingBranches - List of existing branch names to check for collisions
 * @returns The resolved prefix (e.g., "avi") or undefined if no prefix or collision
 */
export async function resolveBranchPrefix(
	project: Project,
	existingBranches: string[],
): Promise<string | undefined> {
	const globalSettings = localDb.select().from(settings).get();
	const projectOverrides = project.branchPrefixMode != null;
	const prefixMode = projectOverrides
		? project.branchPrefixMode
		: (globalSettings?.branchPrefixMode ?? "none");
	const customPrefix = projectOverrides
		? project.branchPrefixCustom
		: globalSettings?.branchPrefixCustom;

	const rawPrefix = await getBranchPrefix({
		repoPath: project.mainRepoPath,
		mode: prefixMode,
		customPrefix,
	});
	// Normalize empty strings to undefined (sanitizing can return "")
	const sanitizedPrefix = rawPrefix
		? (prefixMode === "custom"
				? sanitizeCustomBranchPrefix(rawPrefix)
				: sanitizeAuthorPrefix(rawPrefix)) || undefined
		: undefined;

	// Check if prefix would collide with an existing branch name
	const prefixWouldCollide =
		sanitizedPrefix && branchPrefixCollides(sanitizedPrefix, existingBranches);

	return prefixWouldCollide ? undefined : sanitizedPrefix;
}
