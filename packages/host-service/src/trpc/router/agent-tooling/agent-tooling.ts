import type { SlashCommand } from "@superset/shared/slash-commands";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../db/schema";
import { queryProcedure, router } from "../../index";
import { resolveHostAgentConfig } from "../agents/agents";
import { resolveDefaultAccountEnv } from "../usage/default-account";
import { listAgentSlashCommands } from "./discovery";

// Declaration emit (docs/interim-router-types.md): the procedure's return
// type must be nameable from dist-types, and shared is runtime-neutral so
// mobile can resolve it.
export type { SlashCommand } from "@superset/shared/slash-commands";

export const agentToolingRouter = router({
	/**
	 * The slash commands and skills the given agent can use in this
	 * workspace. `agent` is a presetId ("claude") or a hostAgentConfigs
	 * instance UUID; agents without discovery support return an empty list,
	 * which composers read as "no menu".
	 */
	listSlashCommands: queryProcedure
		.input(z.object({ workspaceId: z.string(), agent: z.string() }))
		.query(async ({ ctx, input }): Promise<SlashCommand[]> => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Workspace ${input.workspaceId} not found on this host`,
				});
			}
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
				worktreePath: workspace.worktreePath,
				agentId: input.agent,
				presetId,
				env,
			});
		}),
});
