import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	MAX_PAGE_STORAGE_KEY_LENGTH,
	type PageStorageReadback,
} from "@superset/shared/page-storage";
import { pageStorageRecordsPath } from "@superset/shared/page-storage-hub";
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
			"Read what viewers stored on a page through window.superset.storage. Each key holds one slot per person. Without key, lists every key with its record count and last update. With key, returns every person's slot for that key: name, value, and updatedAt. On a just_me page only the creator can read storage; on an org or everyone page, members of the page's organization can, even when the page is public. Anyone else gets an error. Address the page by id or slug; exactly one is required.",
		inputSchema: z
			.object({
				id: optionalish(pageFields.id).describe("Page UUID."),
				slug: optionalish(pageFields.slug).describe("Page slug."),
				key: optionalish(
					z.string().min(1).max(MAX_PAGE_STORAGE_KEY_LENGTH),
				).describe(
					"Storage key to read every person's slot for. Omit to list keys.",
				),
			})
			.refine(hasPageRef, PAGE_REF_MESSAGE),
		handler: async ({ id, slug, key }, ctx) => {
			const pageId = id ?? (await createMcpCaller(ctx).page.get({ slug })).id;
			const response = await fetch(
				`${ctx.realtimeUrl}${pageStorageRecordsPath(pageId, key)}`,
				{
					headers: { authorization: `Bearer ${ctx.bearerToken}` },
					signal: AbortSignal.timeout(10_000),
				},
			);
			if (response.ok) return (await response.json()) as PageStorageReadback;
			if (response.status === 404) {
				throw new Error("This page has no published version");
			}
			const error = (
				(await response.json().catch(() => null)) as { error?: string } | null
			)?.error;
			throw new Error(
				error ?? `Page storage refused the request (${response.status})`,
			);
		},
	});
}
