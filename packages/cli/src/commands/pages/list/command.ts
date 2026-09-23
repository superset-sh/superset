import { number, string, table } from "@superset/cli-framework";
import { PAGE_LIST_MAX_LIMIT } from "@superset/trpc/page-schema";
import { type CliContext, command } from "../../../lib/command";
import { listWorkspacesOnHost } from "../../../lib/host-workspaces";
import { fetchAllPages, fetchPageList } from "../pageList";
import { resolveWorkspaceId } from "../workspaceRef";

interface WorkspaceLink {
	workspaceId: string;
	entryPath: string;
	name?: string;
}

type PageRow = Record<string, unknown> & { workspaceLinks?: WorkspaceLink[] };

async function cloudWorkspaceNames(
	ctx: CliContext,
	organizationId: string,
): Promise<[string, string][]> {
	try {
		const workspaces = await ctx.api.cloudWorkspace.list.query({
			organizationId,
		});
		return workspaces.map((workspace) => [workspace.id, workspace.name]);
	} catch {
		return [];
	}
}

async function hostWorkspaceNames(
	ctx: CliContext,
	organizationId: string,
): Promise<[string, string][]> {
	try {
		const { workspaces } = await listWorkspacesOnHost({
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});
		return workspaces.map((workspace) => [workspace.id, workspace.name]);
	} catch {
		return [];
	}
}

async function workspaceNames(ctx: CliContext): Promise<Map<string, string>> {
	const organizationId = ctx.config.organizationId;
	if (!organizationId) return new Map();
	const [cloud, host] = await Promise.all([
		cloudWorkspaceNames(ctx, organizationId),
		hostWorkspaceNames(ctx, organizationId),
	]);
	return new Map([...host, ...cloud]);
}

export function nameLinks(
	rows: PageRow[],
	names: Map<string, string>,
): PageRow[] {
	if (names.size === 0) return rows;
	return rows.map((row) =>
		row.workspaceLinks
			? {
					...row,
					workspaceLinks: row.workspaceLinks.map((link) => {
						const name = names.get(link.workspaceId);
						return name ? { ...link, name } : link;
					}),
				}
			: row,
	);
}

export function workspaceCell(row: PageRow): string {
	const links = row.workspaceLinks ?? [];
	const shown = links.find((link) => link.name) ?? links[0];
	if (!shown) return "—";
	const label = shown.name ?? shown.workspaceId.slice(0, 8);
	return links.length > 1 ? `${label} +${links.length - 1}` : label;
}

export default command({
	description: "List pages in the organization",
	options: {
		workspace: string().desc(
			"Only pages published from this workspace, by name or id (defaults to $SUPERSET_WORKSPACE_ID; pass '' for the whole org)",
		),
		search: string()
			.alias("q")
			.desc("Only pages whose title, slug or description contains this text"),
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
		const asked = options.workspace !== undefined;
		const workspace = asked
			? options.workspace
			: process.env.SUPERSET_WORKSPACE_ID;
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

		const drains = options.limit === undefined && options.cursor === undefined;
		const result = drains
			? { items: await fetchAllPages<PageRow>(ctx, query), nextCursor: null }
			: await fetchPageList<PageRow>(ctx, query, options.cursor);

		// Naming a workspace costs a cloud call and a host call, and the host one
		// waits on a machine that may be asleep. Under `--quiet` only ids are
		// printed, and with no linked page there is nothing to name.
		const quiet = (options as Record<string, unknown>).quiet === true;
		const wanted =
			!quiet &&
			(Boolean(workspaceId && !asked) ||
				result.items.some((row) => row.workspaceLinks?.length));
		const names = wanted
			? await workspaceNames(ctx)
			: new Map<string, string>();

		if (workspaceId && !asked) {
			const label = names.get(workspaceId) ?? workspaceId;
			process.stderr.write(
				`Showing pages from the current workspace (${label}). Pass --workspace '' for the whole organization.\n`,
			);
		}

		if (drains) return { data: nameLinks(result.items, names) };
		return {
			data: {
				items: nameLinks(result.items, names),
				nextCursor: result.nextCursor,
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
				workspace: workspaceCell(row),
				url: row.url,
				id: row.id,
			})),
			["title", "version", "visibility", "workspace", "url", "id"],
			["TITLE", "V", "VISIBILITY", "WORKSPACE", "URL", "ID"],
			[30, 4, 10, 26, 50, 36],
		);
		if (!nextCursor) return rendered;
		return `${rendered}\n\nMore pages available — re-run with --cursor ${nextCursor}, or drop --limit to fetch every page.`;
	},
});
