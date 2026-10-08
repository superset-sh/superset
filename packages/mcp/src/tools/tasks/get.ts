import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { resolveTask, trackerInput } from "./tracker";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "tasks_get",
		annotations: { readOnlyHint: true },
		description:
			"Fetch one task by UUID or slug, or a Linear issue by identifier (e.g. ENG-123) when the organization tracks tasks in Linear. Use this when you have a task ID or slug from a list call or the user.",
		inputSchema: {
			idOrSlug: z
				.string()
				.min(1)
				.describe(
					"Task UUID or slug (e.g. SUPER-172), or a Linear identifier (e.g. ENG-123).",
				),
			tracker: trackerInput,
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const resolved = await resolveTask(caller, input.idOrSlug, input.tracker);
			if (resolved.tracker === "superset") return resolved.task;
			return caller.integration.linear.issue({
				organizationId: ctx.organizationId,
				issueId: resolved.issueId,
			});
		},
	});
}
