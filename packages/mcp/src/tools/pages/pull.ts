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
		name: "pages_pull",
		annotations: { readOnlyHint: true },
		description:
			"Get a download URL for a published page's HTML, plus that version's metadata. Fetch the returned `downloadUrl` to read the bytes — this tool does not return the document itself. The URL is signed and expires after an hour, so fetch it promptly and never store it. Use this when you need to see what a page currently says before editing the source it was published from. Address the page by id or by slug; exactly one is required.",
		inputSchema: z
			.object({
				id: optionalish(pageFields.id).describe("Page UUID."),
				slug: optionalish(pageFields.slug).describe(
					"Page slug, the last path segment of its public URL.",
				),
				version: optionalish(pageFields.version).describe(
					"A specific version number. Omit for whichever version is currently served.",
				),
			})
			.refine(hasPageRef, PAGE_REF_MESSAGE),
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.page.pull(input);
		},
	});
}
