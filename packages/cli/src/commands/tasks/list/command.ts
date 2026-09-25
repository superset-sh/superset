import { boolean, number, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

/** Accepts date-only input (2026-07-10) and expands it to the ISO datetime the API expects. */
function toIsoDatetime(value: string | undefined): string | undefined {
	if (!value) return undefined;
	return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
}

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
		search: string().alias("s").desc("Search by title or description"),
		project: string().desc("Filter by Linear project id"),
		projectName: string().desc(
			"Filter by Linear project name (prefix, case-insensitive)",
		),
		cycle: string().desc("Filter by Linear cycle id"),
		dueFrom: string().desc("Tasks due on or after this date (YYYY-MM-DD)"),
		dueTo: string().desc("Tasks due on or before this date (YYYY-MM-DD)"),
		sortBy: string()
			.enum("createdAt", "updatedAt", "dueDate", "priority")
			.desc("Sort field (default: createdAt)"),
		sortOrder: string().enum("asc", "desc").desc("Sort direction"),
		limit: number().default(50).desc("Max results"),
		offset: number().default(0).desc("Skip results"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["slug", "title", "priority", "assignee", "project"],
			["SLUG", "TITLE", "PRIORITY", "ASSIGNEE", "PROJECT"],
		),
	run: async ({ ctx, options }) => {
		const result = await ctx.api.task.list.query({
			statusId: options.status ?? undefined,
			priority: options.priority,
			assigneeId: options.assignee ?? undefined,
			assigneeMe: options.assigneeMe ?? undefined,
			creatorMe: options.creatorMe ?? undefined,
			search: options.search ?? undefined,
			externalProjectId: options.project ?? undefined,
			externalProjectName: options.projectName ?? undefined,
			externalCycleId: options.cycle ?? undefined,
			dueDateFrom: toIsoDatetime(options.dueFrom),
			dueDateTo: toIsoDatetime(options.dueTo),
			sortBy: options.sortBy,
			sortOrder: options.sortOrder,
			limit: options.limit,
			offset: options.offset,
		});
		return result.map((row) => ({
			...row.task,
			assignee: row.assignee?.name ?? "—",
			project: row.task.externalProjectName ?? "—",
		}));
	},
});
