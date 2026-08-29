import { z } from "zod";

export const OFFERED_ANCHOR_KINDS = ["element", "page"] as const;

export const elementAnchorSchema = z.object({
	path: z.string().min(1).max(2000),
	tag: z.string().min(1).max(40),
	/**
	 * Where inside the element the reader clicked, as a fraction of its box.
	 * Optional because threads created before pins carried a click point have
	 * no offsets, and those keep rendering on the element's top-left corner.
	 */
	offsetX: z.number().min(0).max(1).optional(),
	offsetY: z.number().min(0).max(1).optional(),
});

export type ElementAnchor = z.infer<typeof elementAnchorSchema>;

export const listPageCommentsSchema = z.object({
	pageId: z.string().uuid(),
	// Narrowing only — it can never widen what a caller sees, so it is safe to
	// let the caller ask for it. MCP callers get it forced on regardless.
	activatedOnly: z.boolean().optional(),
});

export const createPageCommentThreadSchema = z
	.object({
		pageId: z.string().uuid(),
		version: z.number().int().positive(),
		anchorKind: z.enum(OFFERED_ANCHOR_KINDS),
		anchor: elementAnchorSchema.nullable().default(null),
		anchorText: z.string().max(500).nullable().default(null),
		body: z.string().min(1).max(10_000),
	})
	.refine(
		(input) => (input.anchorKind === "page") === (input.anchor === null),
		{
			message:
				"An element thread needs an anchor; a page thread must not have one",
			path: ["anchor"],
		},
	);

export const replyPageCommentSchema = z.object({
	threadId: z.string().uuid(),
	body: z.string().min(1).max(10_000),
	/**
	 * Self-reported by a CLI agent, which the server cannot distinguish from
	 * the human who owns the credential. Descriptive only: it names the session
	 * for a reader, it does not prove one. MCP callers are identified from the
	 * transport instead and should not send this.
	 */
	agentSessionId: z.string().min(1).max(200).optional(),
});

export const editPageCommentSchema = z.object({
	commentId: z.string().uuid(),
	body: z.string().min(1).max(10_000),
});

export const resolvePageCommentThreadSchema = z.object({
	threadId: z.string().uuid(),
	resolved: z.boolean(),
});

export const deletePageCommentThreadSchema = z.object({
	threadId: z.string().uuid(),
});
