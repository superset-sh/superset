import { z } from "zod";

export const OFFERED_VISIBILITIES = ["just_me", "org"] as const;

/**
 * Field-level schemas shared by this router's inputs and by the MCP tool
 * definitions that front them. A constraint declared here is declared once —
 * the agent-facing tool schema decorates these rather than restating them,
 * so the two can't drift.
 */
export const pageFields = {
	id: z.string().uuid(),
	slug: z.string().min(1).max(120),
	version: z.number().int().positive(),
	filename: z.string().min(1).max(255),
	entryPath: z.string().min(1).max(1024),
	workspaceId: z.string().uuid(),
	title: z.string().min(1).max(200),
	description: z.string().max(2000),
	label: z.string().max(200),
	visibility: z.enum(OFFERED_VISIBILITIES),
	agentId: z.string().min(1).max(200),
} as const;

const publishPageFieldsSchema = z.object({
	// The document goes to storage first, on the URL `page.assets.upload`
	// presigns; publish is handed the id that returned. A request body never
	// carries the bytes: the API's body limit is a fraction of the ceiling.
	fileId: pageFields.id,
	filename: pageFields.filename,
	entryPath: pageFields.entryPath.optional(),
	workspaceId: pageFields.workspaceId.optional(),
	pageId: pageFields.id.optional(),
	title: pageFields.title.optional(),
	description: pageFields.description.optional(),
	label: pageFields.label.optional(),
	visibility: pageFields.visibility.optional(),
});

/**
 * `workspaceId` and `entryPath` are one key, not two fields — exported so the
 * MCP publish tool can enforce the pairing at its edge rather than letting a
 * model send half of it and get a runtime error back.
 */
export const hasCompleteWorkspaceLink = (value: {
	pageId?: string | undefined;
	workspaceId?: string | undefined;
	entryPath?: string | undefined;
}) =>
	// `runPublish` ignores the link when `pageId` is set, so a workspace id sent
	// alongside one is inert rather than half a key.
	Boolean(value.pageId) ||
	Boolean(value.workspaceId) === Boolean(value.entryPath);

export const WORKSPACE_LINK_MESSAGE = {
	message: "workspaceId and entryPath must be provided together",
	path: ["entryPath"],
};

/**
 * A publish with no anchor mints a page no workspace lists and no later publish
 * can find — including the id needed to pass `pageId`.
 */
export const isAnchoredPublish = (value: {
	pageId?: string | undefined;
	workspaceId?: string | undefined;
	entryPath?: string | undefined;
}) => Boolean(value.pageId) || Boolean(value.workspaceId && value.entryPath);

export const ANCHOR_MESSAGE = {
	message:
		"A publish must name where it lives: pass workspaceId and entryPath, or pageId to add a version to an existing page",
	path: ["workspaceId"],
};

/**
 * Strict on purpose. Zod strips unknown keys by default, so a newer client
 * against an older server has its extra fields silently discarded — a CLI
 * that uploaded assets and sent them here would get a successful publish
 * whose page is missing every one of them, with no error anywhere. Refusing
 * the key is how a version mismatch becomes visible.
 */
export const publishPageSchema = publishPageFieldsSchema
	.strict()
	.refine(hasCompleteWorkspaceLink, WORKSPACE_LINK_MESSAGE)
	.refine(isAnchoredPublish, ANCHOR_MESSAGE);

export type PublishPageInput = z.infer<typeof publishPageSchema>;

/**
 * A page can exist with no versions. Assets stage against a page id, so a
 * first publish that carries assets creates the page up front and publishes
 * into it, rather than letting `publish` mint the id it would have needed
 * before the upload.
 */
export const createPageSchema = z
	.object({
		title: pageFields.title.optional(),
		description: pageFields.description.optional(),
		visibility: pageFields.visibility.optional(),
		entryPath: pageFields.entryPath.optional(),
		workspaceId: pageFields.workspaceId.optional(),
	})
	.refine(hasCompleteWorkspaceLink, WORKSPACE_LINK_MESSAGE);

export type CreatePageInput = z.infer<typeof createPageSchema>;

export const listPagesSchema = z
	.object({ workspaceId: pageFields.workspaceId.optional() })
	.optional();

const pageRefFieldsSchema = z.object({
	id: pageFields.id.optional(),
	slug: pageFields.slug.optional(),
});

/**
 * "Exactly one of id or slug" — exported so the MCP tools can enforce the same
 * rule at their edge instead of letting a model discover it at call time.
 */
export const hasPageRef = (value: {
	id?: string | undefined;
	slug?: string | undefined;
}) => Boolean(value.id ?? value.slug);

export const PAGE_REF_MESSAGE = { message: "Provide either id or slug" };

export const pageRefSchema = pageRefFieldsSchema.refine(
	hasPageRef,
	PAGE_REF_MESSAGE,
);

export const setPageVisibilitySchema = z.object({
	id: pageFields.id,
	visibility: pageFields.visibility,
});

export const setSharedVersionSchema = z.object({
	id: pageFields.id,
	version: pageFields.version.nullable(),
});

export const deletePageSchema = z.object({ id: pageFields.id });

export const pullPageSchema = pageRefFieldsSchema
	.extend({ version: pageFields.version.optional() })
	.refine(hasPageRef, PAGE_REF_MESSAGE);

export const setPageWatchSchema = z.object({
	id: pageFields.id,
	agentId: pageFields.agentId.nullable().default(null),
});

export const clearPageWatchSchema = z.object({ id: pageFields.id });
