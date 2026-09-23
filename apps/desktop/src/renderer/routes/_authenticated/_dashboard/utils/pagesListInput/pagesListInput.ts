const PAGES_PER_BATCH = 200;

export interface PagesListFilter {
	workspaceId?: string;
	search?: string;
}

export function pagesListInput(filter: PagesListFilter = {}) {
	return { limit: PAGES_PER_BATCH, ...filter };
}
