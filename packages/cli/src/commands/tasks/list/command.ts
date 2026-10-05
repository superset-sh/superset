import {
	boolean,
	CLIError,
	number,
	string,
	table,
} from "@superset/cli-framework";
import { linearStatusFilterValues } from "@superset/trpc/linear-lookup";
import { type CliContext, command } from "../../../lib/command";
import {
	linearIssueRow,
	linearTeam,
	linearUserId,
	linearWorkspace,
	rejectUnsupported,
} from "../linear";
import {
	requireOrganizationId,
	resolveTracker,
	trackerOption,
} from "../tracker";

/** Accepts date-only input (2026-07-10) and expands it to the ISO datetime the API expects. */
function toIsoDatetime(value: string | undefined): string | undefined {
	if (!value) return undefined;
	return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
}

export default command({
	description: "List tasks in the organization",
	options: {
		tracker: trackerOption,
		status: string().desc(
			`Filter by status id; for Linear, one of ${linearStatusFilterValues.join(", ")} (default: active)`,
		),
		team: string().desc("Linear team key (Linear only)"),
		priority: string()
			.enum("urgent", "high", "medium", "low", "none")
			.desc("Filter by priority"),
		assignee: string().desc(
			"Filter by assignee user id (for Linear: Linear user id, email, me or unassigned)",
		),
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
		limit: number().int().min(1).max(500).default(50).desc("Max results"),
		offset: number().int().min(0).default(0).desc("Skip results"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["slug", "title", "priority", "assignee", "project"],
			["SLUG", "TITLE", "PRIORITY", "ASSIGNEE", "PROJECT"],
		),
	run: async ({ ctx, options }) => {
		if ((await resolveTracker(ctx, options.tracker)) === "linear") {
			return listLinearIssues(ctx, options);
		}
		if (options.team) {
			throw new CLIError("--team only applies to Linear issues");
		}
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

async function listLinearIssues(
	ctx: CliContext,
	options: {
		status?: string;
		team?: string;
		assignee?: string;
		assigneeMe?: boolean;
		search?: string;
		limit: number;
		offset: number;
		priority?: string;
		creatorMe?: boolean;
		project?: string;
		projectName?: string;
		cycle?: string;
		dueFrom?: string;
		dueTo?: string;
		sortBy?: string;
		sortOrder?: string;
	},
) {
	const { status, team, assignee, assigneeMe, search, limit, offset } = options;
	rejectUnsupported({
		priority: options.priority,
		creatorMe: options.creatorMe,
		project: options.project,
		projectName: options.projectName,
		cycle: options.cycle,
		dueFrom: options.dueFrom,
		dueTo: options.dueTo,
		sortBy: options.sortBy,
		sortOrder: options.sortOrder,
	});
	const linearStatus = status ?? "active";
	if (!(linearStatusFilterValues as readonly string[]).includes(linearStatus)) {
		throw new CLIError(
			`Unknown Linear status filter: ${linearStatus}`,
			`Use one of: ${linearStatusFilterValues.join(", ")}`,
		);
	}
	const organizationId = requireOrganizationId(ctx);
	const assigneeIsKeyword = assignee === "me" || assignee === "unassigned";
	const workspace =
		team || (assignee && !assigneeIsKeyword)
			? await linearWorkspace(ctx, organizationId)
			: null;

	const rows: ReturnType<typeof linearIssueRow>[] = [];
	let cursor: string | null = null;
	do {
		const page = await ctx.api.integration.linear.issues.query({
			organizationId,
			status: linearStatus as (typeof linearStatusFilterValues)[number],
			teamId: workspace && team ? linearTeam(workspace, team).id : undefined,
			assignee: assigneeMe
				? "me"
				: assigneeIsKeyword
					? assignee
					: workspace && assignee
						? linearUserId(workspace, assignee)
						: undefined,
			search: search ?? undefined,
			cursor,
		});
		rows.push(...page.issues.map(linearIssueRow));
		cursor = page.nextCursor;
	} while (cursor && rows.length < offset + limit);
	return rows.slice(offset, offset + limit);
}
