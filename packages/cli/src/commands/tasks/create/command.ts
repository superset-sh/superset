import { CLIError, number, string } from "@superset/cli-framework";
import { isValid, parseISO } from "date-fns";
import { command } from "../../../lib/command";
import {
	linearIssueRow,
	linearStateId,
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

export default command({
	description: "Create a task",
	options: {
		tracker: trackerOption,
		title: string().required().desc("Task title"),
		description: string().desc("Task description"),
		priority: string()
			.enum("urgent", "high", "medium", "low", "none")
			.desc("Priority"),
		assignee: string().desc(
			"Assignee user ID (for Linear: Linear user id or email)",
		),
		statusId: string().desc("Status ID (for Linear: status name or id)"),
		team: string().desc(
			"Team key or name (for Linear: needed when you have several teams)",
		),
		estimate: number().int().min(1).desc("Story-point estimate"),
		dueDate: string().desc("Due date (ISO 8601)"),
		labels: string().desc("Comma-separated labels"),
	},
	run: async ({ ctx, options }) => {
		let dueDate: Date | undefined;
		if (options.dueDate) {
			const parsed = parseISO(options.dueDate);
			if (!isValid(parsed)) {
				throw new CLIError(
					`--due-date: invalid ISO 8601 date "${options.dueDate}"`,
				);
			}
			dueDate = parsed;
		}

		if ((await resolveTracker(ctx, options.tracker)) === "linear") {
			rejectUnsupported({ labels: options.labels });
			const organizationId = requireOrganizationId(ctx);
			const workspace = await linearWorkspace(ctx, organizationId);
			const team = linearTeam(workspace, options.team ?? undefined);
			const issue = await ctx.api.integration.linear.createIssue.mutate({
				organizationId,
				teamId: team.id,
				title: options.title,
				description: options.description ?? undefined,
				priority: options.priority,
				assigneeId: options.assignee
					? linearUserId(workspace, options.assignee)
					: undefined,
				stateId: options.statusId
					? linearStateId(team, options.statusId)
					: undefined,
				estimate: options.estimate ?? undefined,
				dueDate: options.dueDate ? options.dueDate.slice(0, 10) : undefined,
			});
			const row = linearIssueRow(issue);
			return {
				data: row,
				message: `Created Linear issue ${row.slug}: ${row.title}\n${row.url}`,
			};
		}

		const labels = options.labels
			? options.labels
					.split(",")
					.map((label) => label.trim())
					.filter(Boolean)
			: undefined;
		const result = await ctx.api.task.create.mutate({
			title: options.title,
			team: options.team ?? undefined,
			description: options.description ?? undefined,
			priority: options.priority,
			assigneeId: options.assignee ?? undefined,
			statusId: options.statusId ?? undefined,
			estimate: options.estimate ?? undefined,
			dueDate,
			labels,
		});

		const task = result.task;
		return {
			data: task,
			message: `Created task ${task?.slug}: ${task?.title}`,
		};
	},
});
