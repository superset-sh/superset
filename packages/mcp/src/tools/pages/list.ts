import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	PAGE_LIST_DEFAULT_LIMIT,
	PAGE_LIST_MAX_LIMIT,
	pageListCursorSchema,
} from "@superset/trpc/page-schema";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "pages_list",
		annotations: { readOnlyHint: true },
		description:
			"List published pages in the active organization, newest first. A page is one self-contained HTML file published to a shareable URL. Returns only pages the caller may read: everything shared with the organization, plus the caller's own private ones. Use this to find a page's id or slug before calling any other pages_* tool. Results are paginated: pass `search` to narrow by title or slug, and when `nextCursor` comes back non-null pass it as `cursor` to get the next batch.",
		inputSchema: {
			workspaceId: z
				.string()
				.uuid()
				.nullish()
				.describe(
					"Only pages published from this workspace. Omit for every page in the organization.",
				),
			search: z
				.string()
				.min(1)
				.max(200)
				.nullish()
				.describe(
					"Only pages whose title or slug contains this text, case-insensitive.",
				),
			limit: z
				.number()
				.int()
				.min(1)
				.max(PAGE_LIST_MAX_LIMIT)
				.nullish()
				.describe(
					`How many pages to return, 1-${PAGE_LIST_MAX_LIMIT} (default ${PAGE_LIST_DEFAULT_LIMIT}).`,
				),
			cursor: pageListCursorSchema
				.nullish()
				.describe(
					"The `nextCursor` object from a previous call, passed back unchanged, to fetch the next batch. Omit for the first batch.",
				),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.page.list({
				...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
				...(input?.search ? { search: input.search } : {}),
				...(input?.limit ? { limit: input.limit } : {}),
				...(input?.cursor ? { cursor: input.cursor } : {}),
			});
		},
	});
}
