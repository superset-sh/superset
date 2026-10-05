import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { resolveTask, trackerInput } from "./tracker";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "tasks_delete",
		annotations: { destructiveHint: true },
		description:
			"Delete a task (soft delete — the row is tombstoned, not purged). A Linear issue is archived when the organization tracks tasks in Linear.",
		inputSchema: {
			id: z
				.string()
				.min(1)
				.describe("Task UUID or slug, or a Linear identifier (e.g. ENG-123)."),
			tracker: trackerInput,
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const resolved = await resolveTask(caller, input.id, input.tracker);
			if (resolved.tracker === "superset") {
				return caller.task.delete(resolved.task.id);
			}
			await caller.integration.linear.archiveIssue({
				organizationId: ctx.organizationId,
				issueId: resolved.issueId,
			});
			return { archived: resolved.issueId };
		},
	});
}
