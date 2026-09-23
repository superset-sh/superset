import { basename } from "node:path";
import { eq, inArray } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, workspaceRepos, workspaces } from "../db/schema";

export interface WorkspaceRepo {
	/** Null for the primary synthesized from a workspace with no rows yet. */
	id: string | null;
	workspaceId: string;
	position: number;
	projectId: string;
	folder: string;
	worktreePath: string;
	branch: string;
	baseBranch: string | null;
}

/**
 * A workspace's checkouts in position order, primary first. A workspace with
 * no rows of its own reads as the single checkout its columns already
 * describe, so callers never branch on whether the backfill has run.
 */
export function listWorkspaceRepos(
	db: HostDb,
	workspaceId: string,
): WorkspaceRepo[] {
	const rows = db
		.select()
		.from(workspaceRepos)
		.where(eq(workspaceRepos.workspaceId, workspaceId))
		.all()
		.sort((a, b) => a.position - b.position);
	if (rows.length > 0) {
		return rows.map((row) => ({
			id: row.id,
			workspaceId: row.workspaceId,
			position: row.position,
			projectId: row.projectId,
			folder: row.folder,
			worktreePath: row.worktreePath,
			branch: row.branch,
			baseBranch: row.baseBranch,
		}));
	}

	const workspace = db
		.select({
			projectId: workspaces.projectId,
			worktreePath: workspaces.worktreePath,
			branch: workspaces.branch,
		})
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	if (!workspace?.projectId) return [];
	const project = db
		.select({ repoPath: projects.repoPath })
		.from(projects)
		.where(eq(projects.id, workspace.projectId))
		.get();
	return [
		{
			id: null,
			workspaceId,
			position: 0,
			projectId: workspace.projectId,
			folder: basename(project?.repoPath ?? workspace.worktreePath),
			worktreePath: workspace.worktreePath,
			branch: workspace.branch,
			baseBranch: null,
		},
	];
}

export function findWorkspaceRepo(
	db: HostDb,
	workspaceId: string,
	repo?: string | null,
): WorkspaceRepo | undefined {
	const repos = listWorkspaceRepos(db, workspaceId);
	if (repo == null || repo === "") return repos[0];
	return repos.find(
		(candidate) => candidate.folder === repo || candidate.id === repo,
	);
}

export interface WorkspaceRepoDescriptor {
	folder: string;
	projectId: string;
	/** `owner/name` when the repo has a parsed GitHub remote, else its folder. */
	repository: string | null;
	branch: string;
	base: string | null;
	path: string;
}

interface WorkspaceRowForRepos {
	id: string;
	projectId: string | null;
	worktreePath: string;
	branch: string;
}

export function describeWorkspaceReposByWorkspaceId(
	db: HostDb,
	rows: WorkspaceRowForRepos[],
): Map<string, WorkspaceRepoDescriptor[]> {
	const byWorkspace = new Map<string, WorkspaceRepoDescriptor[]>();
	if (rows.length === 0) return byWorkspace;

	const repoRows = db
		.select()
		.from(workspaceRepos)
		.where(
			inArray(
				workspaceRepos.workspaceId,
				rows.map((row) => row.id),
			),
		)
		.all()
		.sort((a, b) => a.position - b.position);

	const projectIds = new Set<string>();
	for (const repo of repoRows) projectIds.add(repo.projectId);
	for (const row of rows) if (row.projectId) projectIds.add(row.projectId);
	const projectById = new Map(
		projectIds.size === 0
			? []
			: db
					.select({
						id: projects.id,
						repoPath: projects.repoPath,
						repoOwner: projects.repoOwner,
						repoName: projects.repoName,
					})
					.from(projects)
					.where(inArray(projects.id, [...projectIds]))
					.all()
					.map((project) => [project.id, project] as const),
	);
	const repositoryOf = (projectId: string, fallback: string): string | null => {
		const project = projectById.get(projectId);
		if (project?.repoOwner && project.repoName) {
			return `${project.repoOwner}/${project.repoName}`;
		}
		return project ? basename(project.repoPath) : fallback;
	};

	for (const repo of repoRows) {
		const list = byWorkspace.get(repo.workspaceId) ?? [];
		list.push({
			folder: repo.folder,
			projectId: repo.projectId,
			repository: repositoryOf(repo.projectId, repo.folder),
			branch: repo.branch,
			base: repo.baseBranch,
			path: repo.worktreePath,
		});
		byWorkspace.set(repo.workspaceId, list);
	}

	for (const row of rows) {
		if (byWorkspace.has(row.id) || !row.projectId) continue;
		const folder = basename(
			projectById.get(row.projectId)?.repoPath ?? row.worktreePath,
		);
		byWorkspace.set(row.id, [
			{
				folder,
				projectId: row.projectId,
				repository: repositoryOf(row.projectId, folder),
				branch: row.branch,
				base: null,
				path: row.worktreePath,
			},
		]);
	}

	return byWorkspace;
}
