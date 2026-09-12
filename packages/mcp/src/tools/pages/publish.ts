import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	ANCHOR_MESSAGE,
	hasCompleteWorkspaceLink,
	isAnchoredPublish,
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
			"Publish an HTML document as a page and return its public URL. ALWAYS read the `superset:page` skill before calling this, whenever that skill is available to you — pages are served from their own origin under a strict content policy, and a document that ignores it looks correct locally and breaks silently once published: no network from script (fetch, XHR, and WebSockets are blocked — bake data into the document as a literal), no `eval` or `new Function` (several chart libraries rely on them and render nothing), and no external scripts or stylesheets (inline all CSS and JS). Images, video, and audio may load from remote hosts, though data: URIs keep the page whole offline. Storage (localStorage, cookies) works and is scoped to the page. A page is ONE self-contained file: pass the document itself in `html`, not a file path. A document over about 4 MB does not fit in a tool call: publish it with the CLI instead (`superset pages publish <path>`), which takes pages up to 16 MB. Every call creates a new version; pass `pageId` to add a version to an existing page instead of creating a new one. Every page belongs to a workspace: pass `workspaceId` (from `$SUPERSET_WORKSPACE_ID`, or `superset workspaces list`) plus an `entryPath` naming where the page lives in it.",
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
					"`org` (the default) lets anyone in the organization open it; `just_me` keeps it private to the publisher.",
				),
				workspaceId: pageFields.workspaceId.describe(
					"The workspace this page belongs to. Required: a page that names no workspace is listed by nothing and cannot be versioned later. Get it from the `SUPERSET_WORKSPACE_ID` environment variable, or by running `superset workspaces list`.",
				),
				entryPath: optionalish(pageFields.entryPath).describe(
					"Where this page lives in the workspace, as a path relative to the workspace root, e.g. `reports/q3-pipeline.html`. Together with `workspaceId` it is the key a later publish reuses to add a version rather than minting a second page, so reuse the same value when updating. Required unless `pageId` is given.",
				),
			})
			.refine(hasCompleteWorkspaceLink, WORKSPACE_LINK_MESSAGE)
			.refine(isAnchoredPublish, ANCHOR_MESSAGE),
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const { html, filename, description, label, ...rest } = input;
			const bytes = Buffer.from(html, "utf8");
			const name = filename ?? "page.html";

			// The same path every client takes: the document goes to storage on
			// the URL the upload presigns, and publish records the version from
			// it. Only a repeated asset comes back already stored, never a
			// document — the check below is what narrows the shared result.
			const staged = await caller.page.assets.upload({
				kind: "document",
				name,
				contentType: "text/html",
				sizeBytes: bytes.length,
				sha256: createHash("sha256").update(bytes).digest("hex"),
			});
			if (staged.upload) {
				const response = await fetch(staged.upload.url, {
					method: "PUT",
					headers: staged.upload.headers,
					body: bytes,
				});
				if (!response.ok) {
					throw new Error(`Uploading ${name} failed (${response.status})`);
				}
			}

			return caller.page.publish({
				...rest,
				fileId: staged.fileId,
				filename: name,
				// These two are the only fields where "" passes validation, and
				// republish patches on `!== undefined` — so forwarding an empty
				// string would silently wipe an existing value. Treat it as unset.
				...(description ? { description } : {}),
				...(label ? { label } : {}),
			});
		},
	});
}
