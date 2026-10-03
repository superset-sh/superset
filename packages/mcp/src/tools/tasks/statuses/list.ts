import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findLinearTeam } from "@superset/trpc/linear-lookup";
import { z } from "zod";
import { createMcpCaller } from "../../../caller";
import { defineTool } from "../../../define-tool";
import { resolveTracker, trackerInput, withLookupHint } from "../tracker";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "tasks_statuses_list",
		annotations: { readOnlyHint: true },
		description:
			"List the available task statuses in the active organization, or each Linear team's statuses when the organization tracks tasks in Linear. Use this to look up a status by name (e.g. 'In Progress', 'Done') before creating or updating a task.",
		inputSchema: {
			tracker: trackerInput,
			team: z
				.string()
				.min(1)
				.nullish()
				.describe("Linear only: team key, e.g. ENG."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			if ((await resolveTracker(caller, input?.tracker)) === "superset") {
				if (input?.team)
					throw new Error("Superset statuses are shared by every team");
				const rows = await caller.task.statuses.list();
				return { statuses: rows };
			}
			const workspace = await caller.integration.linear.workspace({
				organizationId: ctx.organizationId,
			});
			const teams = input?.team
				? [
						withLookupHint(() =>
							findLinearTeam(workspace, input.team as string, "team"),
						),
					]
				: workspace.teams;
			return {
				statuses: teams.flatMap((team) =>
					team.states.map((state) => ({ team: team.key, ...state })),
				),
			};
		},
	});
}
