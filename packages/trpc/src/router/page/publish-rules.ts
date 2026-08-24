import { PAGE_CONTENT_TYPES as SHARED_PAGE_CONTENT_TYPES } from "@superset/shared/page-content-types";
import { validateUploadBytes } from "../../lib/upload-bytes";

export const PAGE_CONTENT_TYPES: ReadonlySet<string> = new Set(
	SHARED_PAGE_CONTENT_TYPES,
);

export const MAX_PAGE_BYTES = 3 * 1024 * 1024;

export const VERSION_CONFLICT_CONSTRAINT =
	"page_versions_page_id_version_unique";

export const ENTRY_PATH_CONFLICT_CONSTRAINT =
	"workspace_pages_workspace_id_entry_path_unique";

export function titleFromFilename(filename: string): string {
	const dotIndex = filename.lastIndexOf(".");
	const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
	const words = stem.replace(/[-_]+/g, " ").trim();
	return words || filename;
}

// Walks the cause chain: drizzle re-throws driver errors wrapped in a
// DrizzleQueryError, so the pg fields sit below the error actually caught.
function isUniqueViolation(error: unknown, constraint: string): boolean {
	for (
		let current: unknown = error, depth = 0;
		current !== null && typeof current === "object" && depth < 8;
		current = (current as { cause?: unknown }).cause, depth += 1
	) {
		const candidate = current as { code?: string; constraint?: string };
		if (candidate.code === "23505" && candidate.constraint === constraint) {
			return true;
		}
	}
	return false;
}

export function isVersionConflict(error: unknown): boolean {
	return isUniqueViolation(error, VERSION_CONFLICT_CONSTRAINT);
}

// Never retryable: the row holding this entry path belongs to another page and
// will not clear on its own.
export function isEntryPathConflict(error: unknown): boolean {
	return isUniqueViolation(error, ENTRY_PATH_CONFLICT_CONSTRAINT);
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
