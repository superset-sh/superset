import { getHostId, getHostName } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";

export type EnsureMainWorkspaceContext = Pick<
	HostServiceContext,
	"api" | "db" | "git" | "organizationId"
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
 * transient cloud blip during setup or sweep doesn't fail the caller — the
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
 * Strict variant: ensure a `type='main'` v2 workspace exists for
 * (projectId, currentHost) with a matching local `workspaces` row, or
 * throw. The create-project saga uses this so a workspace failure rolls
 * back the whole saga, including the cloud project commit.
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

	const host = await ctx.api.host.ensure.mutate({
		organizationId: ctx.organizationId,
		machineId: getHostId(),
		name: getHostName(),
	});

	const cloudRow = await ctx.api.v2Workspace.create.mutate({
		organizationId: ctx.organizationId,
		projectId,
		name: branch,
		branch,
		hostId: host.machineId,
		type: "main",
	});

	ctx.db
		.insert(workspaces)
		.values({
			id: cloudRow.id,
			projectId,
			worktreePath: repoPath,
			branch,
		})
		.onConflictDoUpdate({
			target: workspaces.id,
			set: {
				projectId,
				worktreePath: repoPath,
				branch,
			},
		})
		.run();

	return { id: cloudRow.id };
}
