import { CLIError } from "@superset/cli-framework";
import { PAGE_LIST_MAX_LIMIT } from "@superset/trpc/page-schema";
import type { CliContext } from "../../lib/command";

export interface PageListCursor {
	updatedAt: string;
	id: string;
}

export interface PageListQuery {
	workspaceId?: string;
	search?: string;
	limit?: number;
}

export interface PageListPage<TPage> {
	items: TPage[];
	nextCursor: PageListCursor | null;
}

export async function fetchPageList<TPage>(
	ctx: CliContext,
	query: PageListQuery,
	cursor?: PageListCursor,
): Promise<PageListPage<TPage>> {
	return (await ctx.api.page.list.query({
		...query,
		...(cursor ? { cursor } : {}),
	})) as unknown as PageListPage<TPage>;
}

export async function fetchAllPages<TPage>(
	ctx: CliContext,
	query: PageListQuery = {},
): Promise<TPage[]> {
	const batched = { limit: PAGE_LIST_MAX_LIMIT, ...query };
	const items: TPage[] = [];
	let cursor: PageListCursor | undefined;
	do {
		const result = await fetchPageList<TPage>(ctx, batched, cursor);
		items.push(...result.items);
		cursor = result.nextCursor ?? undefined;
	} while (cursor);
	return items;
}

export function encodeCursor(cursor: PageListCursor): string {
	return Buffer.from(
		JSON.stringify({ updatedAt: cursor.updatedAt, id: cursor.id }),
	).toString("base64url");
}

export function decodeCursor(value: string): PageListCursor {
	const invalid = () =>
		new CLIError(
			"Could not read --cursor",
			"Pass the nextCursor from a previous --json run, or drop the flag to start over",
		);

	let parsed: unknown;
	try {
		parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
	} catch {
		throw invalid();
	}

	const cursor = parsed as Partial<PageListCursor> | null;
	if (typeof cursor?.id !== "string" || typeof cursor.updatedAt !== "string") {
		throw invalid();
	}
	return { updatedAt: cursor.updatedAt, id: cursor.id };
}
