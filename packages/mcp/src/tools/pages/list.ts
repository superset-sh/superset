import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "pages_list",
		annotations: { readOnlyHint: true },
		description:
			"List published pages in the active organization, newest first. A page is one self-contained HTML file published to a shareable URL. Returns only pages the caller may read: everything shared with the organization, plus the caller's own private ones. Use this to find a page's id or slug before calling any other pages_* tool.",
		inputSchema: {
			workspaceId: z
				.string()
				.uuid()
				.nullish()
				.describe(
					"Only pages published from this workspace. Omit for every page in the organization.",
				),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.page.list(
				input?.workspaceId ? { workspaceId: input.workspaceId } : undefined,
			);
		},
	});
}
