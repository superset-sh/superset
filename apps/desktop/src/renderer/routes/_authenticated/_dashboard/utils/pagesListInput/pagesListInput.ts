import type { PageListScope } from "@superset/trpc/page-schema";

const PAGES_PER_BATCH = 48;

export interface PagesListFilter {
	workspaceId?: string;
	search?: string;
	scope?: PageListScope;
	authorId?: string;
	ids?: string[];
	limit?: number;
}

export function pagesListInput({
	limit = PAGES_PER_BATCH,
	...filter
}: PagesListFilter = {}) {
	return { limit, ...filter };
}
