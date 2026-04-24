import { getDeviceName, getHashedDeviceId } from "@superset/shared/device-info";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../../db/schema";
import { protectedProcedure } from "../../../index";
import { findWorktreeAtPath, listWorktreeBranches } from "../branch-helpers";
import { projectNotSetupError } from "../helpers";

/**
 * Adopt an existing git worktree as a workspace. Used when the Worktree
 * tab surfaces a branch whose worktree directory exists on disk but has
 * no corresponding workspaces row (e.g. partial create rollback). No git
 * ops — just registers the cloud + local workspace row over the
 * existing worktree path.
 */
export const adopt = protectedProcedure
	.input(
		z.object({
			projectId: z.string(),
			workspaceName: z.string(),
			branch: z.string(),
			// When provided, adopt the worktree at this explicit path instead
			// of looking one up under <repoPath>/.worktrees/<branch>. Used by
			// the v1→v2 migration to adopt worktrees at legacy paths (e.g.
			// ~/.superset/worktrees/...) that aren't under the picker's
			// Superset-managed prefix.
			worktreePath: z.string().optional(),
		}),
	)
	.mutation(async ({ ctx, input }) => {
		const deviceClientId = getHashedDeviceId();
		const deviceName = getDeviceName();

		const localProject = ctx.db.query.projects
			.findFirst({ where: eq(projects.id, input.projectId) })
			.sync();
		if (!localProject) {
			throw projectNotSetupError(input.projectId);
		}

		const branch = input.branch.trim();
		if (!branch) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Branch name is empty",
			});
		}

		const git = await ctx.git(localProject.repoPath);

		let worktreePath: string;
		if (input.worktreePath) {
			const found = await findWorktreeAtPath(git, input.worktreePath, branch);
			if (!found) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `No git worktree registered at "${input.worktreePath}" on branch "${branch}"`,
				});
			}
			worktreePath = input.worktreePath;
		} else {
			const { worktreeMap } = await listWorktreeBranches(
				ctx,
				git,
				input.projectId,
			);
			const found = worktreeMap.get(branch);
			if (!found) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `No existing worktree for branch "${branch}"`,
				});
			}
			worktreePath = found;
		}

		// We used to short-circuit on an existing local `workspaces` row
		// (returning its id without calling cloud). That returned a
		// phantom id when the cloud row had been hard-deleted — the
		// picker would navigate to a workspace that no longer exists.
		// Always create a fresh cloud row; if a stale local row leftover
		// from a prior delete exists, replace it below. Proper host-side
		// cleanup on delete is owned by the follow-up delete PR.
		const host = await ctx.api.device.ensureV2Host.mutate({
			organizationId: ctx.organizationId,
			machineId: deviceClientId,
			name: deviceName,
		});

		const cloudRow = await ctx.api.v2Workspace.create.mutate({
			organizationId: ctx.organizationId,
			projectId: input.projectId,
			name: input.workspaceName,
			branch,
			hostId: host.id,
		});

		if (!cloudRow) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Cloud workspace create returned no row",
			});
		}

		// Replace any stale local row for this (project, branch) — its
		// id likely points at a deleted cloud row. The new cloudRow.id
		// is the authoritative mapping.
		const stale = ctx.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.projectId, input.projectId))
			.all()
			.find((w) => w.branch === branch);
		if (stale && stale.id !== cloudRow.id) {
			ctx.db.delete(workspaces).where(eq(workspaces.id, stale.id)).run();
		}

		ctx.db
			.insert(workspaces)
			.values({
				id: cloudRow.id,
				projectId: input.projectId,
				worktreePath,
				branch,
			})
			.run();

		return {
			workspace: cloudRow,
			terminals: [] as Array<{ id: string; role: string; label: string }>,
			warnings: [] as string[],
		};
	});
