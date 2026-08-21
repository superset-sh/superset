import { PAGE_CONTENT_TYPES as SHARED_PAGE_CONTENT_TYPES } from "@superset/shared/page-content-types";
import { validateUploadBytes } from "../../lib/upload-bytes";

export const PAGE_CONTENT_TYPES: ReadonlySet<string> = new Set(
	SHARED_PAGE_CONTENT_TYPES,
);

export const MAX_PAGE_BYTES = 3 * 1024 * 1024;

export const VERSION_CONFLICT_CONSTRAINT =
	"page_versions_page_id_version_unique";

/** "quarterly-report.html" -> "quarterly report" */
export function titleFromFilename(filename: string): string {
	const dotIndex = filename.lastIndexOf(".");
	const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
	const words = stem.replace(/[-_]+/g, " ").trim();
	return words || filename;
}

// Narrow on purpose: any other unique violation is a real error and must not
// be retried into a loop.
export function isVersionConflict(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const candidate = error as { code?: string; constraint?: string };
	return (
		candidate.code === "23505" &&
		candidate.constraint === VERSION_CONFLICT_CONSTRAINT
	);
}

export function validatePublishContent({
	content,
	contentType,
}: {
	content: string;
	contentType: string;
}): { buffer: Buffer; sha256: string } {
	return validateUploadBytes({
		content,
		contentType,
		allowed: PAGE_CONTENT_TYPES,
		maxBytes: MAX_PAGE_BYTES,
	});
}
