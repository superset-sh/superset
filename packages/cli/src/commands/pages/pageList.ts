import type { RouterOutputs } from "@superset/trpc";
import { PAGE_LIST_MAX_LIMIT } from "@superset/trpc/page-schema";
import type { CliContext } from "../../lib/command";

type PageList = RouterOutputs["page"]["listBatch"];

export interface PageListQuery {
	workspaceId?: string;
	search?: string;
	limit?: number;
}

export interface PageListPage<TPage> {
	items: TPage[];
	nextCursor: PageList["nextCursor"];
}

export async function fetchPageList<TPage>(
	ctx: CliContext,
	query: PageListQuery,
	cursor?: string,
): Promise<PageListPage<TPage>> {
	const result = await ctx.api.page.listBatch.query({
		...query,
		...(cursor ? { cursor } : {}),
	});
	return result as PageListPage<TPage>;
}

export async function fetchAllPages<TPage>(
	ctx: CliContext,
	query: PageListQuery = {},
): Promise<TPage[]> {
	const batched = { limit: PAGE_LIST_MAX_LIMIT, ...query };
	const items: TPage[] = [];
	let cursor: string | undefined;
	do {
		const result = await fetchPageList<TPage>(ctx, batched, cursor);
		items.push(...result.items);
		cursor = result.nextCursor ?? undefined;
	} while (cursor);
	return items;
}
