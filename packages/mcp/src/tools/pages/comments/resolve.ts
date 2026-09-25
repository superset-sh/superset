import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../../caller";
import { defineTool } from "../../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "pages_comments_resolve",
		annotations: { destructiveHint: false },
		description:
			"Mark a comment thread on a published page resolved, or reopen one. Call pages_comments_reply first so the thread records what changed before it closes. Anyone who can read the page may resolve a thread — that is a statement about the page, not about the comment.",
		inputSchema: {
			threadId: z
				.string()
				.uuid()
				.describe("Thread UUID, from pages_comments_list."),
			resolved: z
				.boolean()
				.default(true)
				.describe("True to resolve the thread, false to reopen it."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.pageComment.resolve({
				threadId: input.threadId,
				resolved: input.resolved,
			});
		},
	});
}
