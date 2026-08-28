import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { projects } from "../db/schema";
import { createGitEnvResolver } from "../runtime/git/git";
import {
	normalizeWorktreePath,
	type WorktreeRecord,
} from "../trpc/router/workspace-creation/shared/worktree-list";
import type { HostServiceContext } from "../types";
import { getHostWorkerPool } from "../workers/host-worker-pool";
import { gitWorktreeListTask } from "../workers/tasks/git";
import {
	type HostWorkspaceRow,
	updateLocalWorkspace,
	type WorkspaceStoreContext,
} from "./local-workspace-store";

export type MovedWorktreeContext = WorkspaceStoreContext &
	Pick<HostServiceContext, "credentials">;

// Exported as a mutable object so tests can drive it with an in-process git
// client instead of the worker pool.
export const movedWorktreeGitOps = {
	async listWorktrees(
		ctx: MovedWorktreeContext,
		repoPath: string,
	): Promise<WorktreeRecord[]> {
		const gitEnv = await createGitEnvResolver(ctx.credentials)(repoPath);
		return getHostWorkerPool().run(
			gitWorktreeListTask,
			{ repoPath, gitEnv },
			{ timeoutMs: 15_000 },
		);
	},
};

function getProjectRepoPath(
	ctx: MovedWorktreeContext,
	workspace: HostWorkspaceRow,
): string | null {
	if (!workspace.projectId) return null;
	const project = ctx.db.query.projects
		.findFirst({ where: eq(projects.id, workspace.projectId) })
		.sync();
	if (!project || !existsSync(project.repoPath)) return null;
	return project.repoPath;
}

async function listWorktreesSafe(
	ctx: MovedWorktreeContext,
	repoPath: string,
): Promise<WorktreeRecord[]> {
	try {
		return await movedWorktreeGitOps.listWorktrees(ctx, repoPath);
	} catch (err) {
		console.warn(`[workspace] git worktree list failed for ${repoPath}:`, err);
		return [];
	}
}

/**
 * A workspace whose worktree was relocated with `git worktree move` keeps a
 * stale `worktreePath` while git itself stays healthy. When the recorded
 * path is gone, look the branch up in `git worktree list` for the project
 * and re-point the row. Returns the (possibly repaired) row, or the original
 * row when nothing could be repaired.
 */
export async function repairMovedWorktree(
	ctx: MovedWorktreeContext,
	workspace: HostWorkspaceRow,
): Promise<HostWorkspaceRow> {
	if (existsSync(workspace.worktreePath)) return workspace;
	if (workspace.type !== "worktree" || !workspace.branch) return workspace;
	const repoPath = getProjectRepoPath(ctx, workspace);
	if (!repoPath) return workspace;

	const stalePath = normalizeWorktreePath(workspace.worktreePath);
	const match = (await listWorktreesSafe(ctx, repoPath)).find(
		(wt) =>
			!wt.bare &&
			wt.branch === workspace.branch &&
			normalizeWorktreePath(wt.path) !== stalePath &&
			existsSync(wt.path),
	);
	if (!match) return workspace;

	console.warn(
		`[workspace] worktree for ${workspace.id} (${workspace.branch}) moved: ${workspace.worktreePath} -> ${match.path}; repairing stored path`,
	);
	return (
		updateLocalWorkspace(ctx, workspace.id, { worktreePath: match.path }) ??
		workspace
	);
}

export type WorktreePathValidation =
	| { ok: true; worktreePath: string }
	| { ok: false; message: string };

/** Validate a caller-supplied path before re-pointing a workspace at it. */
export async function validateWorktreePathUpdate(
	ctx: MovedWorktreeContext,
	workspace: HostWorkspaceRow,
	requestedPath: string,
): Promise<WorktreePathValidation> {
	if (workspace.type !== "worktree") {
		return {
			ok: false,
			message: "Only worktree workspaces can be re-pointed",
		};
	}
	const worktreePath = normalizeWorktreePath(requestedPath);
	if (!existsSync(worktreePath)) {
		return { ok: false, message: `Path does not exist: ${worktreePath}` };
	}
	const repoPath = getProjectRepoPath(ctx, workspace);
	if (!repoPath) {
		return { ok: false, message: "Workspace project repository not found" };
	}
	const record = (await listWorktreesSafe(ctx, repoPath)).find(
		(wt) => normalizeWorktreePath(wt.path) === worktreePath,
	);
	if (!record) {
		return {
			ok: false,
			message: `${worktreePath} is not a worktree of ${repoPath}`,
		};
	}
	if (record.branch !== workspace.branch) {
		return {
			ok: false,
			message: `${worktreePath} is on branch ${record.branch ?? "(detached)"}, but the workspace is on ${workspace.branch}`,
		};
	}
	return { ok: true, worktreePath };
}
