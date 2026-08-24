import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../../caller";
import { defineTool } from "../../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "pages_comments_list",
		annotations: { readOnlyHint: true },
		description:
			"List the comment threads left on a published page, oldest first, with every reply and whether the thread is resolved. Each thread is anchored to one element: `anchor.path` is a CSS selector path from <body> in the published HTML, and `anchorText` is what that element contained when the comment was written. Use the returned thread ids with pages_comments_reply and pages_comments_resolve. Only threads a person has handed to an agent are returned, and those are the only ones you can reply to or resolve — a page whose comments nobody handed off comes back empty, which means there is nothing for you to do, not that something went wrong.",
		inputSchema: {
			pageId: z
				.string()
				.uuid()
				.describe("Page UUID. Find it with pages_list or pages_get."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.pageComment.list({ pageId: input.pageId });
		},
	});
}
