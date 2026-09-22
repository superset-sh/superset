import { pages } from "@superset/db/schema";
import { ilike, or, type SQL } from "drizzle-orm";

/**
 * `%` and `_` are LIKE wildcards, so a query containing them has to be
 * escaped or "100%_done" would match far more than the page named that.
 */
export function likePattern(query: string): string {
	return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

export function pageSearchFilter(query: string): SQL | undefined {
	const pattern = likePattern(query.trim());
	return or(
		ilike(pages.title, pattern),
		ilike(pages.description, pattern),
		ilike(pages.slug, pattern),
	);
}
