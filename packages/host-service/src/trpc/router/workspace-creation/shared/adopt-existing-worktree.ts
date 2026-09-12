import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import {
	type CloudShapedWorkspace,
	deleteLocalWorkspace,
	getLocalWorkspace,
	insertLocalWorkspace,
	toCloudShape,
	unshelveLocalWorkspace,
	updateLocalWorkspace,
	type WorkspaceStoreContext,
} from "../../../../workspaces/local-workspace-store";
import { gitConfigWrite } from "../../git/utils/config-write";
import type { GitClient } from "./types";

// Workspaces have no cloud mirror since local-first (#5731); the host's own
// cloud-compatible row shape is the response type.
export type AdoptedWorkspace = CloudShapedWorkspace;

export interface AdoptExistingWorktreeArgs {
	ctx: HostServiceContext;
	git: GitClient;
	projectId: string;
	branch: string;
	worktreePath: string;
	workspaceName: string;
	baseBranch?: string;
	/** v1→v2 migration relinks to a known cloud id; other callers leave undefined. */
	existingWorkspaceId?: string;
	/** Optimistic-UI idempotency key; becomes the row id when creating fresh. */
	idempotencyId?: string;
	/** Task link recorded on the row; ignored on relink. */
	taskId?: string;
	/** Applied only when a NEW row is inserted; adopted rows keep their tags. */
	tags?: string[];
}

export interface AdoptExistingWorktreeResult {
	workspace: AdoptedWorkspace;
	/** True when an existing row was reused; false when a new row was
	 *  created in this call. Used by `workspaces.create` to decide whether
	 *  to dispatch setup terminal + sugar agents. */
	alreadyExists: boolean;
}

/**
 * Register a workspace for a worktree that already exists on disk. Owns
 * all the stale-row hygiene (relink by branch, relink-on-rename by path,
 * conflict cleanup) so callers don't reinvent it.
 *
 * Fully local — the host's own table is authoritative and workspaces have
 * no cloud mirror.
 *
 * Cross-project safety is the caller's responsibility — only pass a
 * `worktreePath` that came from `git worktree list` on this project's
 * `git`. A path registered against a different repo's git dir won't be
 * detected here and will silently land as a row in the wrong project.
 */
export async function adoptExistingWorktree(
	args: AdoptExistingWorktreeArgs,
): Promise<AdoptExistingWorktreeResult> {
	const {
		ctx,
		git,
		projectId,
		branch,
		worktreePath,
		workspaceName,
		baseBranch,
		existingWorkspaceId,
		idempotencyId,
		taskId,
		tags,
	} = args;
	const store: WorkspaceStoreContext = {
		db: ctx.db,
		eventBus: ctx.eventBus,
		api: ctx.api,
		organizationId: ctx.organizationId,
		clientMachineId: ctx.clientMachineId,
		userId: ctx.userId,
	};

	if (existingWorkspaceId) {
		await recordBaseBranch(git, branch, baseBranch);
		deleteLocalWorkspaceConflicts(store, {
			projectId,
			worktreePath,
			branch,
			keepWorkspaceId: existingWorkspaceId,
		});
		const existing = getLocalWorkspace(ctx.db, existingWorkspaceId);
		if (existing) {
			const updated =
				updateLocalWorkspace(store, existingWorkspaceId, {
					projectId,
					worktreePath,
					branch,
				}) ?? existing;
			// Relinking states the worktree is in use just as much as the
			// reuse paths below do, so it clears a shelf stamp too.
			const restored = unshelveLocalWorkspace(store, existingWorkspaceId);
			return {
				workspace: toCloudShape(restored ?? updated, ctx.organizationId),
				alreadyExists: true,
			};
		}
		const inserted = insertLocalWorkspace(store, {
			id: existingWorkspaceId,
			projectId,
			worktreePath,
			branch,
			name: workspaceName,
			taskId: taskId ?? null,
			tags,
		});
		return {
			workspace: toCloudShape(inserted, ctx.organizationId),
			alreadyExists: true,
		};
	}

	// Already linked at this exact (branch, path) — reuse the row.
	const existingByBranch = ctx.db.query.workspaces
		.findFirst({
			where: and(
				eq(workspaces.projectId, projectId),
				eq(workspaces.branch, branch),
				isNull(workspaces.archivedAt),
			),
		})
		.sync();
	if (existingByBranch && existingByBranch.worktreePath === worktreePath) {
		await recordBaseBranch(git, branch, baseBranch);
		const current = getLocalWorkspace(ctx.db, existingByBranch.id);
		if (!current || current.archivedAt != null) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "Workspace was deleted during adoption",
			});
		}
		// Adopting is a statement that the worktree is in use, so it clears a
		// shelf stamp along with the rest of the reconciliation — otherwise the
		// adopt reports success while the row stays hidden and scheduled for
		// purge.
		const reused = unshelveLocalWorkspace(store, existingByBranch.id);
		return {
			workspace: toCloudShape(reused ?? existingByBranch, ctx.organizationId),
			alreadyExists: true,
		};
	}

	// Same path, different branch — branch was renamed in place. Re-point
	// the row at the new branch instead of leaving a phantom row.
	const existingByPath = ctx.db.query.workspaces
		.findFirst({
			where: and(
				eq(workspaces.projectId, projectId),
				eq(workspaces.worktreePath, worktreePath),
				isNull(workspaces.archivedAt),
			),
		})
		.sync();
	if (existingByPath) {
		deleteLocalWorkspaceConflicts(store, {
			projectId,
			worktreePath,
			branch,
			keepWorkspaceId: existingByPath.id,
		});
		const updated = updateLocalWorkspace(store, existingByPath.id, { branch });
		await recordBaseBranch(git, branch, baseBranch);
		const current = getLocalWorkspace(ctx.db, existingByPath.id);
		if (!current || current.archivedAt != null) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "Workspace was deleted during adoption",
			});
		}
		const reused = unshelveLocalWorkspace(store, existingByPath.id);
		if (updated) {
			return {
				workspace: toCloudShape(reused ?? updated, ctx.organizationId),
				alreadyExists: true,
			};
		}
	}

	// Fresh registration. Mint the id up front so conflict cleanup can
	// exclude it, then insert locally.
	const id = idempotencyId ?? randomUUID();
	await recordBaseBranch(git, branch, baseBranch);
	deleteLocalWorkspaceConflicts(store, {
		projectId,
		worktreePath,
		branch,
		keepWorkspaceId: id,
	});

	let inserted: ReturnType<typeof insertLocalWorkspace>;
	try {
		inserted = insertLocalWorkspace(store, {
			id,
			projectId,
			worktreePath,
			branch,
			name: workspaceName,
			taskId: taskId ?? null,
			tags,
		});
	} catch (err) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to persist workspace locally: ${err instanceof Error ? err.message : String(err)}`,
		});
	}

	return {
		workspace: toCloudShape(inserted, ctx.organizationId),
		alreadyExists: false,
	};
}

/**
 * Drop rows that claim this (branch or path) other than the surviving id.
 * They are superseded duplicates.
 */
function deleteLocalWorkspaceConflicts(
	store: WorkspaceStoreContext,
	args: {
		projectId: string;
		worktreePath: string;
		branch: string;
		keepWorkspaceId: string;
	},
): void {
	const conflicts = store.db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(
			and(
				eq(workspaces.projectId, args.projectId),
				or(
					eq(workspaces.branch, args.branch),
					eq(workspaces.worktreePath, args.worktreePath),
				),
				ne(workspaces.id, args.keepWorkspaceId),
				// Tombstones aren't phantoms — same-branch history must survive
				// re-creating a workspace on that branch. A shelved row is even
				// less of a phantom: it is live and restorable, with a worktree
				// still on disk that a hard delete here would orphan.
				isNull(workspaces.archivedAt),
				isNull(workspaces.shelvedAt),
			),
		)
		.all();
	for (const conflict of conflicts) {
		deleteLocalWorkspace(store, conflict.id);
	}
}

async function recordBaseBranch(
	git: GitClient,
	branch: string,
	baseBranch: string | undefined,
): Promise<void> {
	if (!baseBranch) return;
	await gitConfigWrite(git as Parameters<typeof gitConfigWrite>[0], [
		"config",
		`branch.${branch}.base`,
		baseBranch,
	]).catch((err) => {
		console.warn(
			`[adoptExistingWorktree] failed to record base branch ${baseBranch}:`,
			err,
		);
	});
}
