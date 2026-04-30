import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { projects, workspaces } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";

type WorkspaceRow = typeof workspaces.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;

export type IsMainWorkspaceResult = {
	local: WorkspaceRow | undefined;
	project: ProjectRow | undefined;
} & ({ isMain: true; reason: string } | { isMain: false; reason: null });

export const MAIN_WORKSPACE_REASON =
	"Main workspaces cannot be deleted. Remove them from the sidebar or remove the project from this host instead.";

/**
 * Authoritative "is this a main workspace?" check for the cleanup router.
 *
 * Two signals, either is sufficient:
 *   - local: worktreePath equals the project's repoPath, after realpath
 *     normalization (without it, symlinks / trailing slash / macOS case
 *     differences silently fail open).
 *   - cloud: v2Workspaces.type === "main" (only checked if `ctx.api` is wired
 *     and the local check didn't already fire).
 *
 * Both signals exist because either side can lag the other: a workspace
 * classified as main in cloud may not yet have its local worktreePath
 * rewritten, and vice versa.
 *
 * Returns the loaded `local`/`project` rows alongside the verdict so callers
 * (notably `runDestroy`) can avoid re-querying SQLite for the same rows.
 */
export async function isMainWorkspace(
	ctx: HostServiceContext,
	workspaceId: string,
): Promise<IsMainWorkspaceResult> {
	const local = ctx.db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	const project = local
		? ctx.db.query.projects
				.findFirst({ where: eq(projects.id, local.projectId) })
				.sync()
		: undefined;

	if (
		local &&
		project &&
		normalizePath(local.worktreePath) === normalizePath(project.repoPath)
	) {
		return { isMain: true, reason: MAIN_WORKSPACE_REASON, local, project };
	}

	if (ctx.api) {
		const cloudWorkspace = await ctx.api.v2Workspace.getFromHost.query({
			organizationId: ctx.organizationId,
			id: workspaceId,
		});
		if (cloudWorkspace?.type === "main") {
			return { isMain: true, reason: MAIN_WORKSPACE_REASON, local, project };
		}
	}

	return { isMain: false, reason: null, local, project };
}

function normalizePath(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		return resolve(p);
	}
}
