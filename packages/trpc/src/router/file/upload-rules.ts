import { PAGE_ASSET_CONTENT_TYPES } from "@superset/shared/page-content-types";
import { validateUploadBytes } from "../../lib/upload-bytes";

// SVG is safe as an asset but not as a page: an uploaded SVG must never be
// served from the app's own origin.
export const FILE_CONTENT_TYPES: ReadonlySet<string> = new Set(
	PAGE_ASSET_CONTENT_TYPES,
);

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
