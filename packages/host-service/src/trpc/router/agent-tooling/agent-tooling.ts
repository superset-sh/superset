import type { SlashCommand } from "@superset/shared/slash-commands";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { resolveHostAgentConfig } from "../../../terminal-agents/agent-config";
import type { HostServiceContext } from "../../../types";
import { queryProcedure, router } from "../../index";
import { resolveDefaultAccountEnv } from "../usage/default-account";
import { listAgentSlashCommands } from "./discovery";

// Declaration emit (docs/interim-router-types.md): the procedure's return
// type must be nameable from dist-types, and shared is runtime-neutral so
// mobile can resolve it.
export type { SlashCommand } from "@superset/shared/slash-commands";

function resolveWorktreePath(
	ctx: HostServiceContext,
	input: { workspaceId?: string; projectId?: string },
): string | null {
	if (input.workspaceId !== undefined && input.projectId !== undefined) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Pass workspaceId or projectId, not both",
		});
	}
	if (input.workspaceId !== undefined) {
		const workspace = ctx.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, input.workspaceId) })
			.sync();
		if (!workspace) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Workspace ${input.workspaceId} not found on this host`,
			});
		}
		return workspace.worktreePath;
	}
	if (input.projectId !== undefined) {
		const project = ctx.db.query.projects
			.findFirst({ where: eq(projects.id, input.projectId) })
			.sync();
		if (!project) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Project ${input.projectId} not found on this host`,
			});
		}
		return project.repoPath;
	}
	return null;
}

export const agentToolingRouter = router({
	/**
	 * The slash commands and skills the given agent can use in a workspace's
	 * worktree, a project's repo, or (with neither) user scope only. `agent`
	 * is a presetId ("claude") or a hostAgentConfigs instance UUID; agents
	 * without discovery support return an empty list, which composers read as
	 * "no menu".
	 */
	listSlashCommands: queryProcedure
		.input(
			z.object({
				workspaceId: z.string().optional(),
				projectId: z.string().optional(),
				agent: z.string(),
			}),
		)
		.query(async ({ ctx, input }): Promise<SlashCommand[]> => {
			const worktreePath = resolveWorktreePath(ctx, input);
			const config = resolveHostAgentConfig(ctx.db, input.agent);
			const presetId = config?.presetId ?? input.agent;
			// Same precedence as the agent launch itself: the config's own env
			// wins over the host-default account, so discovery reads the config
			// dir the CLI will actually run with.
			const env = {
				...resolveDefaultAccountEnv(ctx.db, presetId),
				...(config?.env ?? {}),
			};
			return listAgentSlashCommands({
				worktreePath,
				agentId: input.agent,
				presetId,
				env,
			});
		}),
});
