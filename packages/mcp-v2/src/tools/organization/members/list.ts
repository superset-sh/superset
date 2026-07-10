import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../../caller";
import { defineTool } from "../../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "organization_members_list",
		description:
			"List members of the active organization. Use this to look up a user's id by name or email before assigning a task or filtering by assignee.",
		inputSchema: {
			search: z
				.string()
				.min(1)
				.nullish()
				.describe("Free-text search on name or email."),
			limit: z
				.number()
				.int()
				.positive()
				.max(100)
				.default(50)
				.describe("Max members to return. Default 50, max 100."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const rows = await caller.organization.members.list(input ?? {});
			return { members: rows };
		},
	});
}
