import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { linearIssueRow } from "../linear";
import { requireOrganizationId, resolveTask, trackerOption } from "../tracker";

export default command({
	description: "Get a task by ID or slug",
	args: [positional("idOrSlug").required().desc("Task ID or slug")],
	options: { tracker: trackerOption },
	run: async ({ ctx, args, options }) => {
		const idOrSlug = args.idOrSlug as string;
		const resolved = await resolveTask(ctx, idOrSlug, options.tracker);

		if (resolved.tracker === "linear") {
			const issue = await ctx.api.integration.linear.issue.query({
				organizationId: requireOrganizationId(ctx),
				issueId: resolved.issueId,
			});
			const row = linearIssueRow(issue);
			return {
				data: { ...row, description: issue.description },
				message: [
					`${row.slug}: ${row.title}`,
					`Status:   ${row.status}`,
					`Priority: ${row.priority}`,
					`Branch:   ${row.branch}`,
					`URL:      ${row.url}`,
					issue.description ? `\n${issue.description}` : "",
				]
					.filter(Boolean)
					.join("\n"),
			};
		}

		const { task } = resolved;
		return {
			data: task,
			message: [
				`${task.slug}: ${task.title}`,
				`Priority: ${task.priority ?? "—"}`,
				`Branch:   ${task.branch ?? "—"}`,
				task.description ? `\n${task.description}` : "",
			]
				.filter(Boolean)
				.join("\n"),
		};
	},
});
