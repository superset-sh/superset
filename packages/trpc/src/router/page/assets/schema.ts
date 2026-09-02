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
 * file id. The id is the plumbing's business: exposing it would let a caller
 * attach bytes it happens to know the id of, and would leak one page's
 * storage identity into another's API surface.
 */
const pageAssetRef = {
	pageId: pageFields.id,
	path: z.string().min(1).max(512),
};

export const uploadPageAssetSchema = z.object({
	...pageAssetRef,
	name: z.string().min(1).max(255),
	contentType: z.string().min(1).max(255),
	sizeBytes: z.number().int().positive().max(MAX_PAGE_ASSET_BYTES),
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const removePageAssetSchema = z.object(pageAssetRef);

export type UploadPageAssetInput = z.infer<typeof uploadPageAssetSchema>;
