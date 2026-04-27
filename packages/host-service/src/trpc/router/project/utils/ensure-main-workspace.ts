import { getHostId, getHostName } from "@superset/shared/host-info";
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
 * Ensures a `type='main'` v2 workspace exists for (projectId, currentHost),
 * with a matching local `workspaces` row whose `worktreePath` is the repo root.
 *
 * Idempotent: safe to call from `project.setup` and from the startup sweep.
 * Log-and-continue: on any cloud/local failure, logs and returns null so
 * callers (e.g. `project.setup`) don't regress when a transient cloud blip
 * hits. The startup sweep will backfill on the next boot.
 */
export async function ensureMainWorkspace(
	ctx: EnsureMainWorkspaceContext,
	projectId: string,
	repoPath: string,
): Promise<{ id: string } | null> {
	try {
		const git = await ctx.git(repoPath);
		const branch = await getCurrentBranchName(git);
		if (!branch) {
			console.warn(
				`[ensureMainWorkspace] could not resolve current branch for ${projectId} at ${repoPath}; skipping`,
			);
			return null;
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
	} catch (err) {
		console.warn(
			`[ensureMainWorkspace] failed for ${projectId} at ${repoPath}; will retry via startup sweep`,
			err,
		);
		return null;
	}
}
