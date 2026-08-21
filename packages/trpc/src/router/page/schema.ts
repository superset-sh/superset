import { z } from "zod";

/**
 * What the API will accept, which is narrower than the database enum.
 *
 * `everyone` exists in `page_visibility` but is not offered: serving a page to
 * someone with no session needs the pages origin to enforce it, and that does
 * not exist yet. Offering it would mean promising an access level nothing
 * implements. Postgres cannot drop an enum value, so the column keeps it.
 */
export const OFFERED_VISIBILITIES = ["just_me", "org"] as const;

export const publishPageSchema = z.object({
	/** Base64-encoded file bytes. Accepts a bare payload or a data: URL. */
	content: z.string().min(1),
	contentType: z.string().min(1),
	filename: z.string().min(1).max(255),
	/**
	 * Path of the published file relative to the workspace root. Combined with
	 * `workspaceId` this is the republish lookup key — publish the same file
	 * from the same workspace twice and the second becomes v2 rather than a
	 * second page.
	 */
	entryPath: z.string().min(1).max(1024).optional(),
	/** Whatever $SUPERSET_WORKSPACE_ID names — cloud sandbox or local machine. */
	workspaceId: z.string().uuid().optional(),
	/** Explicit republish target. Wins over the workspace lookup. */
	pageId: z.string().uuid().optional(),
	title: z.string().min(1).max(200).optional(),
	description: z.string().max(2000).optional(),
	/** What changed in this version. Display-only; never rewritten. */
	label: z.string().max(200).optional(),
	visibility: z.enum(OFFERED_VISIBILITIES).optional(),
	/**
	 * Files this version references, already uploaded via `file.upload` and
	 * rewritten into the HTML as URLs. They become attachments on the new
	 * version, which is what keeps their blobs alive: an unattached file is
	 * collected by the sweep.
	 */
	fileIds: z.array(z.string().uuid()).max(200).optional(),
});

export type PublishPageInput = z.infer<typeof publishPageSchema>;

export const listPagesSchema = z
	.object({ workspaceId: z.string().uuid().optional() })
	.optional();

/** Pages are addressable by either identifier: id internally, slug in URLs. */
export const pageRefSchema = z
	.object({
		id: z.string().uuid().optional(),
		slug: z.string().min(1).max(120).optional(),
	})
	.refine((value) => Boolean(value.id ?? value.slug), {
		message: "Provide either id or slug",
	});

export const pullPageSchema = z.object({
	id: z.string().uuid(),
	/** Omit to pull whichever version is currently served. */
	version: z.number().int().positive().optional(),
});
