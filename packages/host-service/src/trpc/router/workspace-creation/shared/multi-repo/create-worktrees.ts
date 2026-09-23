import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../../../../types";
import { listBranchNames } from "../../utils/list-branch-names";
import { resolveNewBranchStartPoint } from "../../utils/resolve-new-branch-start-point";
import { deduplicateBranchName } from "../../utils/sanitize-branch";
import { createWorkerBaseRefFetcher } from "../base-ref-fetcher";
import { addBranchWorktree, type BranchSourcePlan } from "../branch-worktree";
import { enablePushAutoSetupRemote } from "../git-config";
import type { GitClient } from "../types";
import type { ProgressReporter, ResolvedFolder } from "./resolve-folders";

const LOG_PREFIX = "[workspaces.create]";

export interface CreatedWorkspaceRepo {
	position: number;
	folder: string;
	projectId: string;
	worktreePath: string;
	branch: string;
	baseBranch: string | null;
	/** Rollback territory: the repository the worktree was added from. Unlike
	 * the fields above, not part of the persisted row. */
	repoPath: string;
	createdBranch: boolean;
}

export interface CreateMultiRepoWorktreesArgs {
	ctx: HostServiceContext;
	containerPath: string;
	folders: ResolvedFolder[];
	primaryPlan: BranchSourcePlan;
	baseBranch: string | undefined;
	onProgress: ProgressReporter;
}

/**
 * Check every folder out into `<container>/<folder>`, primary first.
 *
 * All-or-nothing: the first failure rolls the earlier folders back before
 * throwing, so a partial multi-repo workspace can never reach the database.
 */
export async function createMultiRepoWorktrees(
	args: CreateMultiRepoWorktreesArgs,
): Promise<CreatedWorkspaceRepo[]> {
	const { ctx, containerPath, folders, primaryPlan, baseBranch } = args;

	if (existsSync(containerPath) && readdirSync(containerPath).length > 0) {
		throw new TRPCError({
			code: "CONFLICT",
			message: `Workspace folder already exists and is not empty: ${containerPath}`,
		});
	}
	mkdirSync(containerPath, { recursive: true });

	const created: CreatedWorkspaceRepo[] = [];
	let failedFolder = folders[0]?.folder ?? "";

	try {
		for (const folder of folders) {
			failedFolder = folder.folder;
			const git = await ctx.git(folder.repoPath);
			// Frees branches still claimed by registrations whose directories
			// are gone.
			await git
				.raw(["worktree", "prune"])
				.catch((err) =>
					console.warn(`${LOG_PREFIX} worktree prune failed:`, err),
				);

			const plan =
				folder.position === 0
					? primaryPlan
					: await planSecondaryBranch({
							ctx,
							git,
							folder,
							branch: primaryPlan.branch,
							baseBranch,
						});

			const worktreePath = join(containerPath, folder.folder);
			args.onProgress(`Checking out ${plan.branch} into ${folder.folder}/ …`);
			await addBranchWorktree({
				git,
				plan,
				worktreePath,
				sparsePaths: folder.sparsePaths,
			});

			const recordedBase =
				!plan.usedExistingBranch && plan.startPoint.kind !== "head"
					? plan.startPoint.shortName
					: null;
			created.push({
				position: folder.position,
				folder: folder.folder,
				projectId: folder.projectId,
				worktreePath,
				branch: plan.branch,
				baseBranch: recordedBase,
				repoPath: folder.repoPath,
				createdBranch: !plan.usedExistingBranch,
			});

			await enablePushAutoSetupRemote(git, worktreePath, LOG_PREFIX);
			if (recordedBase) {
				await git
					.raw([
						"-C",
						worktreePath,
						"config",
						`branch.${plan.branch}.base`,
						recordedBase,
					])
					.catch((err) => {
						console.warn(
							`${LOG_PREFIX} failed to record base branch ${recordedBase}:`,
							err,
						);
					});
			}
		}
	} catch (err) {
		await rollbackMultiRepoWorktrees(ctx, created, containerPath);
		const message = err instanceof Error ? err.message : String(err);
		throw new TRPCError({
			code: "CONFLICT",
			message: `Failed to set up folder "${failedFolder}": ${message}`,
		});
	}

	return created;
}

/**
 * The same branch name in every repository where it is free, bumped only
 * where it is taken — one repo's collision must not rename it everywhere.
 */
async function planSecondaryBranch(args: {
	ctx: HostServiceContext;
	git: GitClient;
	folder: ResolvedFolder;
	branch: string;
	baseBranch: string | undefined;
}): Promise<BranchSourcePlan> {
	const existing = await listBranchNames(args.ctx, args.folder.repoPath);
	const taken = existing.some(
		(name) => name.toLowerCase() === args.branch.toLowerCase(),
	);
	const branch = taken
		? deduplicateBranchName(args.branch, existing)
		: args.branch;
	const startPoint = await resolveNewBranchStartPoint(
		args.git,
		args.folder.baseBranch ?? args.baseBranch,
		createWorkerBaseRefFetcher(args.ctx, args.folder.repoPath),
	);
	return { branch, startPoint, usedExistingBranch: false };
}

/** Also the caller's rollback when persisting the workspace row fails. */
export async function rollbackMultiRepoWorktrees(
	ctx: HostServiceContext,
	created: CreatedWorkspaceRepo[],
	containerPath: string,
): Promise<void> {
	for (const repo of [...created].reverse()) {
		try {
			const git = await ctx.git(repo.repoPath);
			await git.raw(["worktree", "remove", "--force", repo.worktreePath]);
			if (repo.createdBranch) {
				await git.raw(["branch", "-D", repo.branch]);
			}
		} catch (err) {
			console.warn(`${LOG_PREFIX} multi-repo rollback failed`, {
				folder: repo.folder,
				worktreePath: repo.worktreePath,
				err,
			});
		}
	}
	// The container is ours — this call created it over an empty or absent
	// path — so removing it cannot take anything the user put there.
	await rm(containerPath, { recursive: true, force: true }).catch((err) => {
		console.warn(`${LOG_PREFIX} failed to remove container`, {
			containerPath,
			err,
		});
	});
}
