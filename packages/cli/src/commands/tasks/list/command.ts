import {
	boolean,
	command,
	number,
	string,
	table,
} from "@superset/cli-framework";
import type { ApiClient } from "../../../lib/api-client";

export default command({
	description: "List tasks in the org",
	options: {
		status: string()
			.enum("backlog", "todo", "in_progress", "done", "cancelled")
			.desc("Filter by status"),
		priority: string()
			.enum("urgent", "high", "medium", "low", "none")
			.desc("Filter by priority"),
		assigneeMe: boolean().alias("m").desc("Filter to my tasks"),
		creatorMe: boolean().desc("Filter to tasks I created"),
		search: string().alias("s").desc("Search query"),
		limit: number().default(50).desc("Max results"),
		offset: number().default(0).desc("Skip results"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["slug", "title", "priority", "assignee"],
			["SLUG", "TITLE", "PRIORITY", "ASSIGNEE"],
		),
	run: async (opts) => {
		const api = opts.ctx.api as ApiClient;
		const result = await api.task.all.query();
		return result.map((r) => ({
			...r.task,
			assignee: r.assignee?.name ?? "—",
		}));
	},
});
