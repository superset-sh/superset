import { COMMENT_IMAGE_CONTENT_TYPES } from "@superset/shared/page-comments";

// Beside the router rather than inside `attachments.ts` for the same reason
// as `agent-access.ts`: the unit tests reach it without importing
// `@superset/db/client`, which opens a connection at module scope.

const COMMENT_IMAGE_TYPES: ReadonlySet<string> = new Set(
	COMMENT_IMAGE_CONTENT_TYPES,
);

/** Whether a server-sniffed content type may hang on a comment. */
export function isCommentImageType(contentType: string): boolean {
	return COMMENT_IMAGE_TYPES.has(contentType);
}
