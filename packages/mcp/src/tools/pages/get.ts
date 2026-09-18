import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	hasPageRef,
	PAGE_REF_MESSAGE,
	pageFields,
} from "@superset/trpc/page-schema";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { optionalish } from "../../optionalish";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "pages_get",
		annotations: { readOnlyHint: true },
		description:
			"Show one published page's metadata: title, description, visibility, public URL, and which version is currently served. Does NOT return the page's HTML — use pages_pull for that. Address the page by id or by slug; exactly one is required. Find either with pages_list when the user refers to the page by name.",
		inputSchema: z
			.object({
				id: optionalish(pageFields.id).describe("Page UUID."),
				slug: optionalish(pageFields.slug).describe(
					"Page slug, the last path segment of its public URL. Take it from pages_list or a URL the user gave you — slugs end in a random suffix and cannot be guessed from a title.",
				),
			})
			.refine(hasPageRef, PAGE_REF_MESSAGE),
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.page.get(input);
		},
	});
}
