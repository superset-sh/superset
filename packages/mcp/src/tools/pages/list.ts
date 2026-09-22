import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { pageFields } from "@superset/trpc/page-schema";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { optionalish } from "../../optionalish";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "pages_list",
		annotations: { readOnlyHint: true },
		description:
			"List published pages in the active organization, most recently updated first. A page is one self-contained HTML file published to a shareable URL. Returns only pages the caller may read: everything shared with the organization, plus the caller's own private ones. This is the ONLY way to discover a page: slugs end in a random suffix (`q3-pipeline-xgfbar`) and cannot be derived from a title, so when the user refers to a page by name, call this first (with `search`) and take the id or slug from the result before calling any other pages_* tool. Omit `workspaceId` unless the user asked about one workspace — a page published from another workspace, machine, or session is otherwise missing from the result.",
		inputSchema: {
			search: optionalish(pageFields.search).describe(
				"Case-insensitive substring matched against title, description, and slug. Use it to find a page by what the user calls it.",
			),
			workspaceId: z
				.string()
				.uuid()
				.nullish()
				.describe(
					"Only pages published from this workspace. Omit for every page in the organization, which is what you want when looking a page up.",
				),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.page.list({
				...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
				...(input?.search ? { search: input.search } : {}),
			});
		},
	});
}
