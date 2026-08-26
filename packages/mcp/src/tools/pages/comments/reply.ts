import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../../caller";
import { defineTool } from "../../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "pages_comments_reply",
		annotations: { destructiveHint: false },
		description:
			"Post a reply into an existing comment thread on a published page. Answer only the threads you were asked to address, and say what you actually changed — the reply is what the person who left the comment reads next. Reply before calling pages_comments_resolve, so closing the thread is not silent.",
		inputSchema: {
			threadId: z
				.string()
				.uuid()
				.describe("Thread UUID, from pages_comments_list."),
			body: z.string().min(1).max(10_000).describe("The reply text."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.pageComment.reply({
				threadId: input.threadId,
				body: input.body,
				// Not sent: the server derives agent attribution from the MCP
				// transport itself, which a body field could only weaken.
			});
		},
	});
}
