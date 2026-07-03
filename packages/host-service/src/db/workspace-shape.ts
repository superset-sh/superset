import { eq } from "drizzle-orm";
import type { HostDb } from "./db";
import { projects, type workspaces } from "./schema";

type WorkspaceRow = typeof workspaces.$inferSelect;

// Legacy rows (pre-identity migration) have a null type, but main workspaces
// were always inserted with worktreePath === the project's repoPath (see
// isMainWorkspace). Every place that shapes a local row (localList, cloud
// mirrors, outbox flush) must coalesce through here — divergent fallbacks made
// the same row report "main" on one path and "worktree" on another.
export function resolveWorkspaceType(
	row: Pick<WorkspaceRow, "type" | "worktreePath">,
	repoPath: string | undefined,
): "main" | "worktree" {
	if (row.type) return row.type;
	return repoPath !== undefined && row.worktreePath === repoPath
		? "main"
		: "worktree";
}

// Single-row variant: looks up the project's repoPath only when the row
// actually needs the legacy fallback.
export function resolveWorkspaceTypeFromDb(
	db: HostDb,
	row: Pick<WorkspaceRow, "type" | "worktreePath" | "projectId">,
): "main" | "worktree" {
	if (row.type) return row.type;
	const project = db.query.projects
		.findFirst({ where: eq(projects.id, row.projectId) })
		.sync();
	return resolveWorkspaceType(row, project?.repoPath);
}
