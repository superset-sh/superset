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
		name: "pages_storage",
		annotations: { readOnlyHint: true },
		description:
			"Read what viewers stored on a page through window.superset.storage. Each key holds one slot per person. Without key, lists every key with its record count and last update. With key, returns every person's slot for that key: name, value, and updatedAt. Only the page's creator can call this; anyone else gets an error. Address the page by id or slug; exactly one is required.",
		inputSchema: z
			.object({
				id: optionalish(pageFields.id).describe("Page UUID."),
				slug: optionalish(pageFields.slug).describe("Page slug."),
				key: optionalish(pageFields.storageKey).describe(
					"Storage key to read every person's slot for. Omit to list keys.",
				),
			})
			.refine(hasPageRef, PAGE_REF_MESSAGE),
		handler: async ({ key, ...ref }, ctx) => {
			const caller = createMcpCaller(ctx);
			return key
				? caller.page.storageRecords({ ...ref, key })
				: caller.page.storageKeys(ref);
		},
	});
}
