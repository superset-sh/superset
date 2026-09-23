import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, notExists, sql } from "drizzle-orm";
import type { HostDb } from "../db";
import {
	projectFolders,
	projects,
	workspaceRepos,
	workspaces,
} from "../db/schema";
import { defaultFolderNameForRepo } from "../projects/project-folders";

export interface MultiRepoBackfillContext {
	db: HostDb;
}

export interface MultiRepoBackfillResult {
	folders: number;
	repos: number;
}

/**
 * Materialize the position-0 rows every project and workspace implicitly had
 * before they could own more than one repo.
 *
 * Idempotent and cheap in steady state: both passes select only rows with no
 * row of their own, and the inserts tolerate a concurrent writer.
 */
export function runMultiRepoBackfill(
	ctx: MultiRepoBackfillContext,
): MultiRepoBackfillResult {
	const { db } = ctx;
	const now = Date.now();

	const projectsWithoutFolders = db
		.select({ id: projects.id, repoPath: projects.repoPath })
		.from(projects)
		.where(
			notExists(
				db
					.select({ one: sql`1` })
					.from(projectFolders)
					.where(eq(projectFolders.projectId, projects.id)),
			),
		)
		.all();

	if (projectsWithoutFolders.length > 0) {
		db.insert(projectFolders)
			.values(
				projectsWithoutFolders.map((project) => ({
					id: randomUUID(),
					projectId: project.id,
					position: 0,
					folder: defaultFolderNameForRepo(project.repoPath),
					repoPath: project.repoPath,
					baseBranch: null,
					createdAt: now,
					updatedAt: now,
				})),
			)
			.onConflictDoNothing()
			.run();
	}

	const workspacesWithoutRepos = db
		.select({
			id: workspaces.id,
			projectId: workspaces.projectId,
			worktreePath: workspaces.worktreePath,
			branch: workspaces.branch,
		})
		.from(workspaces)
		.where(
			and(
				// `workspace_repos` keys on a project; a project-less session
				// has none to key on.
				isNotNull(workspaces.projectId),
				notExists(
					db
						.select({ one: sql`1` })
						.from(workspaceRepos)
						.where(eq(workspaceRepos.workspaceId, workspaces.id)),
				),
			),
		)
		.all();

	if (workspacesWithoutRepos.length === 0) {
		return { folders: projectsWithoutFolders.length, repos: 0 };
	}

	const primaryFolderByProject = new Map(
		db
			.select({
				projectId: projectFolders.projectId,
				folder: projectFolders.folder,
			})
			.from(projectFolders)
			.where(eq(projectFolders.position, 0))
			.all()
			.map((row) => [row.projectId, row.folder]),
	);

	const rows = workspacesWithoutRepos.flatMap((workspace) => {
		const projectId = workspace.projectId;
		if (!projectId) return [];
		const folder = primaryFolderByProject.get(projectId);
		if (!folder) return [];
		return [
			{
				id: randomUUID(),
				workspaceId: workspace.id,
				position: 0,
				projectId,
				folder,
				worktreePath: workspace.worktreePath,
				branch: workspace.branch,
				baseBranch: null,
				createdAt: now,
			},
		];
	});

	if (rows.length > 0) {
		db.insert(workspaceRepos).values(rows).onConflictDoNothing().run();
	}

	return { folders: projectsWithoutFolders.length, repos: rows.length };
}
