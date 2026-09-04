import {
	MAX_PAGE_BYTES,
	PAGE_CONTENT_TYPES,
} from "@superset/shared/page-content-types";
import { z } from "zod";
import { pageFields } from "../schema";

/**
 * A page asset is media riding alongside the document, so the ceiling is well
 * under the plumbing's: large enough for video a page embeds, small enough
 * that one page cannot become an org's file dump. The count matches what a
 * version can carry.
 */
export const MAX_PAGE_ASSET_BYTES = 100 * 1024 * 1024;
export const MAX_PAGE_ASSETS = 200;

/**
 * Callers address an asset by the path they wrote in the document — never by
 * file id. The id is the plumbing's business: accepting one would let a caller
 * attach bytes it happens to know the id of, and would leak one page's storage
 * identity into another's API surface.
 */
const pageAssetRef = {
	pageId: pageFields.id,
	path: z.string().min(1).max(512),
};

const uploadedFile = {
	name: z.string().min(1).max(255),
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
};

/**
 * Two kinds of file, one upload: both presign a PUT against a pending `files`
 * row, so they share this shape rather than growing a second copy of it.
 *
 * An asset is media the document references, staged against the page at the
 * path it holds. A document is the page itself — no path, and no page until
 * publish mints one — and its ceiling and types are the ones the origin will
 * serve. Strict on both, so a client sending the document's bytes here, or a
 * path with a document, is refused rather than silently stripped.
 */
export const uploadPageFileSchema = z.discriminatedUnion("kind", [
	z.strictObject({
		// Optional so the clients already shipped, which knew only assets, keep
		// staging without it; defaulted so what they omit still reads as one.
		kind: z.literal("asset").optional().default("asset"),
		...pageAssetRef,
		...uploadedFile,
		contentType: z.string().min(1).max(255),
		sizeBytes: z.number().int().positive().max(MAX_PAGE_ASSET_BYTES),
	}),
	z.strictObject({
		kind: z.literal("document"),
		...uploadedFile,
		contentType: z.enum(PAGE_CONTENT_TYPES, "A page is an HTML document"),
		sizeBytes: z
			.number()
			.int()
			.positive()
			.max(
				MAX_PAGE_BYTES,
				`A page is at most ${MAX_PAGE_BYTES / 1024 / 1024} MB`,
			),
	}),
]);

export const removePageAssetSchema = z.object(pageAssetRef);

export type UploadPageFileInput = z.infer<typeof uploadPageFileSchema>;
