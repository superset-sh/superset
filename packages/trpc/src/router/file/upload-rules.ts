import { validateUploadBytes } from "../../lib/upload-bytes";

/**
 * What the media library accepts, for now.
 *
 * SVG is in deliberately, and is safe here in a way it would not be as a page:
 * referenced through `<img src>` a browser will not execute script inside it,
 * and the blob lives on the Blob store's own origin rather than the app's, so
 * even direct navigation reaches no session. The constraint that keeps this
 * true: an uploaded SVG must never be served from the app's own origin.
 */
export const FILE_CONTENT_TYPES: ReadonlySet<string> = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/svg+xml",
]);

// Raw cap per file. Base64 inflates by ~4/3, so this stays under the
// serverless request body limit.
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

export function validateFileUpload({
	content,
	contentType,
}: {
	content: string;
	contentType: string;
}): { buffer: Buffer; sha256: string } {
	return validateUploadBytes({
		content,
		contentType,
		allowed: FILE_CONTENT_TYPES,
		maxBytes: MAX_UPLOAD_BYTES,
	});
}
