import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { projects, workspaces } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";

type WorkspaceRow = typeof workspaces.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;

export type LocalCheckoutWorkspaceResult = {
	local: WorkspaceRow | undefined;
	project: ProjectRow | undefined;
	/**
	 * True when the workspace's files ARE the project's primary checkout.
	 * Deleting such a workspace drops its record and sessions only; the
	 * repository, its branches, and every other workspace on it stay.
	 */
	sharesProjectCheckout: boolean;
};

/**
 * Authoritative "does this workspace live on the project's checkout?" check
 * for the cleanup router.
 *
 * Two signals, either is sufficient:
 *   - path: worktreePath equals the project's repoPath, after realpath
 *     normalization (without it, symlinks / trailing slash / macOS case
 *     differences silently fail open — and failing open here means
 *     `git worktree remove` / `rm -rf` against the user's repository).
 *   - type: the local row's `type === "local"`.
 *
 * Returns the loaded `local`/`project` rows alongside the verdict so callers
 * (notably `runDestroy`) can avoid re-querying SQLite for the same rows.
 */
export async function isLocalCheckoutWorkspace(
	ctx: HostServiceContext,
	workspaceId: string,
): Promise<LocalCheckoutWorkspaceResult> {
	const local = ctx.db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	// Session workspaces (null projectId) have no project checkout to share.
	const project = local?.projectId
		? ctx.db.query.projects
				.findFirst({ where: eq(projects.id, local.projectId) })
				.sync()
		: undefined;

	const samePath =
		local !== undefined &&
		project !== undefined &&
		normalizePath(local.worktreePath) === normalizePath(project.repoPath);

	return {
		local,
		project,
		sharesProjectCheckout: samePath || local?.type === "local",
	};
}

function normalizePath(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		return resolve(p);
	}
}
