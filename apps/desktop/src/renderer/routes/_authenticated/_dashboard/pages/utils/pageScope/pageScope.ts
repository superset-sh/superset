import type { PageListScope } from "@superset/trpc/page-schema";

/**
 * The tabs. `pinned` is not a server scope: pins live in renderer storage, so
 * the list asks for them by id instead of by a column.
 */
export const PAGE_SCOPES = ["all", "pinned", "team", "mine"] as const;

export type PageScope = (typeof PAGE_SCOPES)[number];

export function isPageScope(value: unknown): value is PageScope {
	return (PAGE_SCOPES as readonly unknown[]).includes(value);
}

export function serverScope(scope: PageScope): PageListScope {
	return scope === "pinned" ? "all" : scope;
}
