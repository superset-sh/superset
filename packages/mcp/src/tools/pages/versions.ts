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
		name: "pages_versions",
		annotations: { readOnlyHint: true },
		description:
			"List a page's version history, newest first, with each version's label, size, and who published it. Every publish creates a new version; nothing is overwritten. Address the page by id or slug; exactly one is required.",
		inputSchema: z
			.object({
				id: optionalish(pageFields.id).describe("Page UUID."),
				slug: optionalish(pageFields.slug).describe("Page slug."),
			})
			.refine(hasPageRef, PAGE_REF_MESSAGE),
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.page.versions(input);
		},
	});
}
