import {
	boolean,
	number,
	paginated,
	string,
	table,
} from "@superset/cli-framework";
import { command } from "../../../lib/command";

// `task.list` caps each request at 500 rows, so page through in 500s.
const API_PAGE_SIZE = 500;

export default command({
	description: "List tasks in the organization",
	options: {
		status: string().desc("Filter by status id"),
		priority: string()
			.enum("urgent", "high", "medium", "low", "none")
			.desc("Filter by priority"),
		assignee: string().desc("Filter by assignee user id"),
		assigneeMe: boolean().alias("m").desc("Filter to my tasks"),
		creatorMe: boolean().desc("Filter to tasks I created"),
		search: string().alias("s").desc("Search by title"),
		limit: number()
			.int()
			.min(1)
			.default(50)
			.desc("Max results to return (auto-paginated)"),
		offset: number().int().min(0).default(0).desc("Skip results"),
		all: boolean().desc("Fetch every result (ignores --limit)"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["slug", "title", "priority", "assignee"],
			["SLUG", "TITLE", "PRIORITY", "ASSIGNEE"],
		),
	run: async ({ ctx, options }) => {
		const filters = {
			statusId: options.status ?? undefined,
			priority: options.priority,
			assigneeId: options.assignee ?? undefined,
			assigneeMe: options.assigneeMe ?? undefined,
			creatorMe: options.creatorMe ?? undefined,
			search: options.search ?? undefined,
		};

		// Fetch one row beyond what was asked for: if it comes back, more
		// results exist — this avoids a separate count query.
		const want = options.all ? Number.POSITIVE_INFINITY : options.limit;
		const rows: Awaited<ReturnType<typeof ctx.api.task.list.query>> = [];
		let offset = options.offset;
		while (rows.length <= want) {
			const pageSize = Math.min(API_PAGE_SIZE, want + 1 - rows.length);
			const page = await ctx.api.task.list.query({
				...filters,
				limit: pageSize,
				offset,
			});
			rows.push(...page);
			if (page.length < pageSize) break;
			offset += page.length;
		}

		const hasMore = rows.length > want;
		const data = (hasMore ? rows.slice(0, want) : rows).map((row) => ({
			...row.task,
			assignee: row.assignee?.name ?? "—",
		}));

		return paginated(data, {
			returned: data.length,
			// `--all` ignores --limit, so `null` signals "no cap applied"
			// rather than echoing back a misleading number.
			limit: options.all ? null : options.limit,
			offset: options.offset,
			hasMore,
		});
	},
});
