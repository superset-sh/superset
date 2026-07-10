import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import { pushWorkspaceCreateToCloud } from "../../../../runtime/workspace-cloud-sync";
import type { HostServiceContext } from "../../../../types";
import {
	insertLocalWorkspace,
	updateLocalWorkspace,
} from "../../../../workspaces/local-workspace-store";

export type EnsureMainWorkspaceContext = Pick<
	HostServiceContext,
	"api" | "db" | "git" | "organizationId" | "clientMachineId" | "eventBus"
>;

async function getCurrentBranchName(
	git: Awaited<ReturnType<EnsureMainWorkspaceContext["git"]>>,
): Promise<string | null> {
	try {
		const branch = await git.raw(["symbolic-ref", "--short", "HEAD"]);
		const trimmed = branch.trim();
		return trimmed || null;
	} catch {
		try {
			const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
			const trimmed = branch.trim();
			return trimmed && trimmed !== "HEAD" ? trimmed : null;
		} catch {
			return null;
		}
	}
}

/**
 * Idempotent log-and-continue variant. Returns null on any failure so a
 * transient blip during setup or sweep doesn't fail the caller — the
 * startup sweep retries on the next boot. Create flows want strict
 * semantics instead; see `ensureMainWorkspaceStrict`.
 */
export async function ensureMainWorkspace(
	ctx: EnsureMainWorkspaceContext,
	projectId: string,
	repoPath: string,
): Promise<{ id: string } | null> {
	try {
		return await ensureMainWorkspaceStrict(ctx, projectId, repoPath);
	} catch (err) {
		console.warn(
			`[ensureMainWorkspace] failed for ${projectId} at ${repoPath}; will retry via startup sweep`,
			err,
		);
		return null;
	}
}

/**
 * Strict variant: ensure a `type='main'` workspace row exists locally for
 * this project, or throw. Local-first — the row commits to host.db and the
 * cloud mirror is pushed best-effort (a cloud failure no longer fails the
 * caller; the reconciler retries). The one-main-per-project invariant is
 * enforced by the `workspaces_one_main_per_project` partial unique index.
 */
export async function ensureMainWorkspaceStrict(
	ctx: EnsureMainWorkspaceContext,
	projectId: string,
	repoPath: string,
): Promise<{ id: string }> {
	const git = await ctx.git(repoPath);
	const branch = await getCurrentBranchName(git);
	if (!branch) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"Repository is in detached-HEAD state. Check out a branch (e.g. `git checkout main`) before creating the project on this device.",
		});
	}

	const store = { db: ctx.db, eventBus: ctx.eventBus };
	const syncCtx = {
		api: ctx.api,
		db: ctx.db,
		eventBus: ctx.eventBus,
		organizationId: ctx.organizationId,
		clientMachineId: ctx.clientMachineId,
	};

	const existing = ctx.db.query.workspaces
		.findFirst({
			where: and(
				eq(workspaces.projectId, projectId),
				eq(workspaces.type, "main"),
			),
		})
		.sync();
	if (existing) {
		if (existing.branch !== branch || existing.worktreePath !== repoPath) {
			// The repo's checked-out branch moved; follow it. A name that was
			// just the branch follows too (parity with the cloud upsert).
			const updated = updateLocalWorkspace(store, existing.id, {
				branch,
				worktreePath: repoPath,
				...(existing.name === existing.branch ? { name: branch } : {}),
			});
			if (updated) void pushWorkspaceCreateToCloud(syncCtx, updated);
		} else if (existing.cloudSyncedAt === null) {
			void pushWorkspaceCreateToCloud(syncCtx, existing);
		}
		return { id: existing.id };
	}

	let inserted: ReturnType<typeof insertLocalWorkspace>;
	try {
		inserted = insertLocalWorkspace(store, {
			projectId,
			worktreePath: repoPath,
			branch,
			name: branch,
			type: "main",
		});
	} catch (err) {
		// A concurrent caller (e.g. the startup sweep racing a create saga)
		// won the one-main-per-project unique index. That's the desired
		// invariant, not a failure — re-query and return the winner's row.
		const winner = ctx.db.query.workspaces
			.findFirst({
				where: and(
					eq(workspaces.projectId, projectId),
					eq(workspaces.type, "main"),
				),
			})
			.sync();
		if (winner) return { id: winner.id };
		throw err;
	}

	// Cloud may already hold a main for this (project, host) under another
	// id (created by an older build); the push re-keys the local row onto
	// the surviving cloud id in that case.
	const cloudRow = await pushWorkspaceCreateToCloud(syncCtx, inserted);
	return { id: cloudRow?.id ?? inserted.id };
}
