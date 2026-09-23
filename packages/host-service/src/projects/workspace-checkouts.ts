import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, workspaceRepos } from "../db/schema";

export interface WorkspaceCheckout {
	projectId: string;
	repoPath: string;
	worktreePath: string;
	folder: string;
}

export function listWorkspaceCheckouts(
	db: HostDb,
	workspaceId: string,
	primary: { projectId: string; repoPath: string; worktreePath: string },
): WorkspaceCheckout[] {
	const rows = db
		.select({
			projectId: workspaceRepos.projectId,
			worktreePath: workspaceRepos.worktreePath,
			folder: workspaceRepos.folder,
			position: workspaceRepos.position,
			repoPath: projects.repoPath,
		})
		.from(workspaceRepos)
		.innerJoin(projects, eq(projects.id, workspaceRepos.projectId))
		.where(eq(workspaceRepos.workspaceId, workspaceId))
		.all()
		.sort((left, right) => left.position - right.position);

	if (rows.length === 0) {
		return [
			{
				projectId: primary.projectId,
				repoPath: primary.repoPath,
				worktreePath: primary.worktreePath,
				folder: "",
			},
		];
	}

	return rows.map((row) => ({
		projectId: row.projectId,
		repoPath: row.repoPath,
		worktreePath: row.worktreePath,
		folder: row.folder,
	}));
}
