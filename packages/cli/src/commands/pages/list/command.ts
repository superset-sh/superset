import { number, string, table } from "@superset/cli-framework";
import { PAGE_LIST_MAX_LIMIT } from "@superset/trpc/page-schema";
import { command } from "../../../lib/command";
import {
	decodeCursor,
	encodeCursor,
	fetchAllPages,
	fetchPageList,
} from "../pageList";
import { resolveWorkspaceId } from "../workspaceRef";

type PageRow = Record<string, unknown>;

export default command({
	description: "List pages in the organization",
	options: {
		workspace: string().desc(
			"Only pages published from this workspace, by name or id (defaults to $SUPERSET_WORKSPACE_ID)",
		),
		search: string()
			.alias("q")
			.desc("Only pages whose title or slug contains this text"),
		limit: number()
			.int()
			.min(1)
			.max(PAGE_LIST_MAX_LIMIT)
			.desc(
				`Return one batch of this many pages (1-${PAGE_LIST_MAX_LIMIT}) plus a cursor, instead of every page`,
			),
		cursor: string().desc("Continue from a previous run's nextCursor"),
	},
	run: async ({ ctx, options }) => {
		const workspace = options.workspace ?? process.env.SUPERSET_WORKSPACE_ID;
		const workspaceId = workspace
			? await resolveWorkspaceId({
					value: workspace,
					organizationId: ctx.config.organizationId,
					userJwt: ctx.bearer,
					api: ctx.api,
				})
			: undefined;

		const query = {
			...(workspaceId ? { workspaceId } : {}),
			...(options.search ? { search: options.search } : {}),
			...(options.limit !== undefined ? { limit: options.limit } : {}),
		};

		if (options.limit === undefined && options.cursor === undefined) {
			return { data: await fetchAllPages<PageRow>(ctx, query) };
		}

		const result = await fetchPageList<PageRow>(
			ctx,
			query,
			options.cursor ? decodeCursor(options.cursor) : undefined,
		);
		return {
			data: {
				items: result.items,
				nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
			},
		};
	},
	display: (data) => {
		const items = Array.isArray(data)
			? (data as PageRow[])
			: ((data as { items: PageRow[] }).items ?? []);
		const nextCursor = Array.isArray(data)
			? null
			: ((data as { nextCursor: string | null }).nextCursor ?? null);

		const rendered = table(
			items.map((row) => ({
				title: row.title,
				version: row.latestVersion,
				visibility: row.visibility,
				url: row.url,
				id: row.id,
			})),
			["title", "version", "visibility", "url", "id"],
			["TITLE", "V", "VISIBILITY", "URL", "ID"],
			[30, 4, 10, 50, 36],
		);
		if (!nextCursor) return rendered;
		return `${rendered}\n\nMore pages available — re-run with --cursor ${nextCursor}, or drop --limit to fetch every page.`;
	},
});
