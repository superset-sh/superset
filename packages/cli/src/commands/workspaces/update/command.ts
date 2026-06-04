import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Update a workspace",
	args: [positional("id").required().desc("Workspace UUID")],
	options: {
		name: string().desc("Workspace name"),
		taskId: string().desc("Link the workspace to a task by id"),
		clearTask: boolean().desc("Unlink the workspace from its current task"),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		if (options.taskId !== undefined && options.clearTask) {
			throw new CLIError(
				"Cannot combine --task-id and --clear-task",
				"Pass one or the other",
			);
		}

		const taskId = options.clearTask
			? null
			: options.taskId !== undefined
				? options.taskId
				: undefined;

		if (options.name === undefined && taskId === undefined) {
			throw new CLIError(
				"No fields to update",
				"Pass --name, --task-id, or --clear-task",
			);
		}

		const updated = await ctx.api.v2Workspace.update.mutate({
			id,
			...(options.name !== undefined ? { name: options.name } : {}),
			...(taskId !== undefined ? { taskId } : {}),
		});

		return {
			data: updated,
			message: `Updated workspace ${id}`,
		};
	},
});
