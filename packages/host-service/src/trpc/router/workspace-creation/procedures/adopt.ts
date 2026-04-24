import { getDeviceName, getHashedDeviceId } from "@superset/shared/device-info";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import { protectedProcedure } from "../../../index";
import { adoptInputSchema } from "../schemas";
import {
	findWorktreeAtPath,
	listWorktreeBranches,
} from "../shared/branch-search";
import { requireLocalProject } from "../shared/local-project";
import type { TerminalDescriptor } from "../shared/types";

export const adopt = protectedProcedure
	.input(adoptInputSchema)
	.mutation(async ({ ctx, input }) => {
		const deviceClientId = getHashedDeviceId();
		const deviceName = getDeviceName();

		const localProject = requireLocalProject(ctx, input.projectId);

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
		let host: { id: string };
		try {
			host = await ctx.api.device.ensureV2Host.mutate({
				organizationId: ctx.organizationId,
				machineId: deviceClientId,
				name: deviceName,
			});
		} catch (err) {
			if (err instanceof TRPCError) throw err;
			console.error("[workspaceCreation.adopt] ensureV2Host failed", err);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to register host: ${err instanceof Error ? err.message : String(err)}`,
			});
		}

		let cloudRow: Awaited<ReturnType<typeof ctx.api.v2Workspace.create.mutate>>;
		try {
			cloudRow = await ctx.api.v2Workspace.create.mutate({
				organizationId: ctx.organizationId,
				projectId: input.projectId,
				name: input.workspaceName,
				branch,
				hostId: host.id,
			});
		} catch (err) {
			if (err instanceof TRPCError) throw err;
			console.error("[workspaceCreation.adopt] v2Workspace.create failed", err);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to create workspace: ${err instanceof Error ? err.message : String(err)}`,
			});
		}

		if (!cloudRow) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Cloud workspace create returned no row",
			});
		}

		// Replace any stale local row for this (project, branch) — its
		// id likely points at a deleted cloud row. The new cloudRow.id
		// is the authoritative mapping.
		const stale = ctx.db.query.workspaces
			.findFirst({
				where: and(
					eq(workspaces.projectId, input.projectId),
					eq(workspaces.branch, branch),
				),
			})
			.sync();
		if (stale && stale.id !== cloudRow.id) {
			ctx.db.delete(workspaces).where(eq(workspaces.id, stale.id)).run();
		}

		try {
			ctx.db
				.insert(workspaces)
				.values({
					id: cloudRow.id,
					projectId: input.projectId,
					worktreePath,
					branch,
				})
				.onConflictDoUpdate({
					target: workspaces.id,
					set: { projectId: input.projectId, worktreePath, branch },
				})
				.run();
		} catch (err) {
			console.error(
				"[workspaceCreation.adopt] local workspaces insert failed",
				err,
			);
			await ctx.api.v2Workspace.delete
				.mutate({ id: cloudRow.id })
				.catch((cleanupErr) => {
					console.warn(
						"[workspaceCreation.adopt] failed to rollback cloud workspace",
						{ workspaceId: cloudRow.id, err: cleanupErr },
					);
				});
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to persist workspace locally: ${err instanceof Error ? err.message : String(err)}`,
			});
		}

		return {
			workspace: cloudRow,
			terminals: [] as TerminalDescriptor[],
			warnings: [] as string[],
		};
	});
