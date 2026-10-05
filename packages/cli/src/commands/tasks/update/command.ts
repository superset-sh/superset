import { CLIError, number, positional, string } from "@superset/cli-framework";
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
import { requireOrganizationId, resolveTask, trackerOption } from "../tracker";

export default command({
	description: "Update a task",
	args: [positional("idOrSlug").required().desc("Task ID or slug")],
	options: {
		tracker: trackerOption,
		title: string().desc("Task title"),
		description: string().desc("Task description"),
		priority: string()
			.enum("urgent", "high", "medium", "low", "none")
			.desc("Priority"),
		assignee: string().desc(
			"Assignee user ID (for Linear: Linear user id or email)",
		),
		statusId: string().desc("Status ID (for Linear: status name or id)"),
		prUrl: string().desc("Linked PR URL"),
		estimate: number().int().min(1).desc("Story-point estimate"),
		dueDate: string().desc("Due date (ISO 8601)"),
		labels: string().desc("Comma-separated labels"),
	},
	run: async ({ ctx, args, options }) => {
		const idOrSlug = args.idOrSlug as string;
		const resolved = await resolveTask(ctx, idOrSlug, options.tracker);

		let dueDate: Date | undefined;
		if (options.dueDate !== undefined) {
			const parsed = parseISO(options.dueDate);
			if (!isValid(parsed)) {
				throw new CLIError(
					`--due-date: invalid ISO 8601 date "${options.dueDate}"`,
				);
			}
			dueDate = parsed;
		}

		if (resolved.tracker === "linear") {
			rejectUnsupported({ prUrl: options.prUrl, labels: options.labels });
			const organizationId = requireOrganizationId(ctx);
			const needsWorkspace = options.statusId || options.assignee;
			const [current, workspace] = await Promise.all([
				ctx.api.integration.linear.issue.query({
					organizationId,
					issueId: resolved.issueId,
				}),
				needsWorkspace ? linearWorkspace(ctx, organizationId) : null,
			]);
			const issue = await ctx.api.integration.linear.updateIssue.mutate({
				organizationId,
				issueId: current.id,
				title: options.title ?? undefined,
				description: options.description ?? undefined,
				priority: options.priority ?? undefined,
				assigneeId:
					workspace && options.assignee
						? linearUserId(workspace, options.assignee)
						: undefined,
				stateId:
					workspace && options.statusId
						? linearStateId(
								linearTeam(workspace, current.team.key),
								options.statusId,
							)
						: undefined,
				estimate: options.estimate ?? undefined,
				dueDate: options.dueDate ? options.dueDate.slice(0, 10) : undefined,
			});
			const row = linearIssueRow(issue);
			return { data: row, message: `Updated Linear issue ${row.slug}` };
		}

		const { task } = resolved;
		const labels =
			options.labels !== undefined
				? options.labels
						.split(",")
						.map((label) => label.trim())
						.filter(Boolean)
				: undefined;

		const result = await ctx.api.task.update.mutate({
			id: task.id,
			title: options.title ?? undefined,
			description: options.description ?? undefined,
			priority: options.priority ?? undefined,
			assigneeId: options.assignee ?? undefined,
			statusId: options.statusId ?? undefined,
			prUrl: options.prUrl ?? undefined,
			estimate: options.estimate ?? undefined,
			dueDate,
			labels,
		});

		return {
			data: result.task,
			message: `Updated task ${task.slug}`,
		};
	},
});
