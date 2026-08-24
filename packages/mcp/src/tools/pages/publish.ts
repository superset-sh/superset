import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	hasCompleteWorkspaceLink,
	pageFields,
	WORKSPACE_LINK_MESSAGE,
} from "@superset/trpc/page-schema";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { optionalish } from "../../optionalish";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "pages_publish",
		annotations: { destructiveHint: false },
		description:
			"Publish an HTML document as a page and return its public URL. ALWAYS read the `superset:page` skill before calling this, whenever that skill is available to you — pages render in a locked-down iframe (no `allow-same-origin`, so every storage API throws on access) and a document that ignores those constraints looks correct locally and breaks silently once published. A page is ONE self-contained file: inline every stylesheet and script, and embed images as data: URIs — external references will not resolve. Every call creates a new version; pass `pageId` to add a version to an existing page instead of creating a new one. Pass the document itself in `html`, not a file path.",
		inputSchema: z
			.object({
				html: z
					.string()
					.min(1)
					.describe(
						"The complete HTML document, as text. Must be self-contained.",
					),
				filename: optionalish(pageFields.filename).describe(
					"Filename recorded for this version, e.g. `report.html`. Defaults to `page.html`.",
				),
				pageId: optionalish(pageFields.id).describe(
					"Publish a new version of this existing page. Omit to create a new page.",
				),
				title: optionalish(pageFields.title).describe(
					"Page title. Defaults to the filename.",
				),
				description: optionalish(pageFields.description).describe(
					"Short description shown alongside the page.",
				),
				label: optionalish(pageFields.label).describe(
					"What changed in this version, shown in the version history. Display-only.",
				),
				visibility: optionalish(pageFields.visibility).describe(
					"`org` lets anyone in the organization open it; `just_me` keeps it private to the publisher.",
				),
				workspaceId: optionalish(pageFields.workspaceId).describe(
					"Link the page to this workspace so it shows in that workspace's Pages tab. Requires `entryPath`.",
				),
				entryPath: optionalish(pageFields.entryPath).describe(
					"Path of the source file relative to the workspace root. Requires `workspaceId`; together they are the key a later publish reuses to add a version rather than a new page.",
				),
			})
			.refine(hasCompleteWorkspaceLink, WORKSPACE_LINK_MESSAGE),
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const { html, filename, description, label, ...rest } = input;

			return caller.page.publish({
				...rest,
				content: Buffer.from(html, "utf8").toString("base64"),
				contentType: "text/html",
				filename: filename ?? "page.html",
				// These two are the only fields where "" passes validation, and
				// republish patches on `!== undefined` — so forwarding an empty
				// string would silently wipe an existing value. Treat it as unset.
				...(description ? { description } : {}),
				...(label ? { label } : {}),
			});
		},
	});
}
