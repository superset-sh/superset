import { TRPCError } from "@trpc/server";

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

// Reserved on the page origin: these path shapes are the origin's own.
const RESERVED_ASSET_PREFIXES = ["versions/", "files/", "_superset/", "~"];

/**
 * An asset path is the author's relative reference, served verbatim under
 * the version. Anything that could escape, collide with the origin's own
 * paths, or shadow the document is refused before any byte moves.
 */
export function validateAssetPaths(
	assets: readonly { path: string }[] | undefined,
): void {
	if (!assets) return;
	const seen = new Set<string>();
	for (const { path } of assets) {
		const refuse = (reason: string): never => {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Asset path ${JSON.stringify(path)} ${reason}`,
			});
		};
		if (seen.has(path)) refuse("appears twice");
		seen.add(path);
		if (path.startsWith("/") || path.includes("\\"))
			refuse("must be relative, with forward slashes");
		// biome-ignore lint/suspicious/noControlCharactersInRegex: refusing them is the point
		if (/[\x00-\x1f]/.test(path)) refuse("contains control characters");
		const segments = path.split("/");
		if (segments.some((s) => s === "" || s === "." || s === ".."))
			refuse("must not contain empty, . or .. segments");
		if (RESERVED_ASSET_PREFIXES.some((prefix) => path.startsWith(prefix)))
			refuse("starts with a reserved prefix");
		if (path === "index.html") refuse("would shadow the document");
		if (path === "thumbnail.jpg") refuse("is reserved for the capture");
	}
}
