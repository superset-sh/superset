import { getHostId, getHostName } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../../index";
import { ensureMainWorkspace } from "../../project/utils/ensure-main-workspace";
import { adoptInputSchema } from "../schemas";
import { adoptExistingWorktree } from "../shared/adopt-existing-worktree";
import {
	getWorktreeBranchAtPath,
	listWorktreeBranches,
} from "../shared/branch-search";
import { requireLocalProject } from "../shared/local-project";
import type { TerminalDescriptor } from "../shared/types";

/**
 * Adopt a worktree that already exists on disk into a Superset workspace
 * row. Currently the only caller is the v1→v2 migration, which passes
 * an explicit `worktreePath`. Branch-name-only callers (the v2 picker,
 * MCP, agent spawn) go through `workspaces.create`, which handles
 * adoption inline via the same shared helper.
 */
export const adopt = protectedProcedure
	.input(adoptInputSchema)
	.mutation(async ({ ctx, input }) => {
		const localProject = requireLocalProject(ctx, input.projectId);
		await ensureMainWorkspace(ctx, input.projectId, localProject.repoPath);

		let branch = input.branch.trim();
		if (!branch) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Branch name is empty",
			});
		}

		const git = await ctx.git(localProject.repoPath);

		let worktreePath: string;
		if (input.worktreePath) {
			// Path-driven adoption (v1→v2 migration): trust the path the
			// caller computed, and read back the actual checked-out branch
			// so a stale DB branch name doesn't make us miss the worktree.
			const actualBranch = await getWorktreeBranchAtPath(
				git,
				input.worktreePath,
			);
			if (!actualBranch) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `No git worktree registered at "${input.worktreePath}"`,
				});
			}
			branch = actualBranch;
			worktreePath = input.worktreePath;
		} else {
			const { worktreeMap } = await listWorktreeBranches(git);
			const found = worktreeMap.get(branch);
			if (!found) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `No existing worktree for branch "${branch}"`,
				});
			}
			worktreePath = found;
		}

		const hostPromise = ctx.api.host.ensure.mutate({
			organizationId: ctx.organizationId,
			machineId: getHostId(),
			name: getHostName(),
		});
		hostPromise.catch(() => {});

		const { workspace } = await adoptExistingWorktree({
			ctx,
			git,
			projectId: input.projectId,
			branch,
			worktreePath,
			workspaceName: input.workspaceName,
			baseBranch: input.baseBranch,
			existingWorkspaceId: input.existingWorkspaceId,
			hostPromise,
		});

		return {
			workspace,
			terminals: [] as TerminalDescriptor[],
			warnings: [] as string[],
		};
	});
