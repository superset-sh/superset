import { boolean, number, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "List tasks in the organization",
	options: {
		status: string().desc("Filter by status id"),
		priority: string()
			.enum("urgent", "high", "medium", "low", "none")
			.desc("Filter by priority"),
		assigneeMe: boolean().alias("m").desc("Filter to my tasks"),
		creatorMe: boolean().desc("Filter to tasks I created"),
		search: string().alias("s").desc("Search by title"),
		limit: number().default(50).desc("Max results"),
		offset: number().default(0).desc("Skip results"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["slug", "title", "priority", "assignee"],
			["SLUG", "TITLE", "PRIORITY", "ASSIGNEE"],
		),
	run: async ({ ctx, options }) => {
		const result = await ctx.api.task.list.query({
			statusId: options.status ?? undefined,
			priority: options.priority,
			assigneeMe: options.assigneeMe ?? undefined,
			creatorMe: options.creatorMe ?? undefined,
			search: options.search ?? undefined,
			limit: options.limit,
			offset: options.offset,
		});
		return result.map((row) => ({
			...row.task,
			assignee: row.assignee?.name ?? "—",
		}));
	},
});
