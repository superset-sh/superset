import { validateUploadBytes } from "../../lib/upload-bytes";

// The database-free half of publishing: what a page may be, and how a
// concurrent publish is told apart from a real failure. Kept out of publish.ts
// so it is testable without standing up Postgres.

/**
 * HTML only, for now.
 *
 * A page is a document that renders; anything else a page needs — images, PDFs,
 * video — is a row in `files`, attached to the version and referenced by URL
 * from the HTML. Markdown can join this set later with no schema change, since
 * the kind of thing a page is comes from its version's `content_type`.
 */
export const PAGE_CONTENT_TYPES: ReadonlySet<string> = new Set(["text/html"]);

// Raw cap. Base64 inflates by ~4/3, so 3 MB of bytes arrives as ~4 MB of
// payload and stays under the serverless request body limit. Assets no longer
// count against this — they upload separately and the HTML only carries URLs.
export const MAX_PAGE_BYTES = 3 * 1024 * 1024;

export const VERSION_CONFLICT_CONSTRAINT =
	"page_versions_page_id_version_unique";

/** "quarterly-report.html" -> "quarterly report", used when no title is given. */
export function titleFromFilename(filename: string): string {
	const dotIndex = filename.lastIndexOf(".");
	const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
	const words = stem.replace(/[-_]+/g, " ").trim();
	return words || filename;
}

/**
 * Two publishes to the same page can compute the same `max(version) + 1`. The
 * unique index rejects the loser, and we re-run rather than surface it — the
 * whole attempt is one transaction, so a retry re-reads the version and cannot
 * leave a half-written page behind.
 *
 * Deliberately narrow: any other unique violation is a real error and must not
 * be retried into a loop.
 */
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
