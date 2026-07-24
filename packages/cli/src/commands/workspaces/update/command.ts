import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Update a workspace on a host (default: this machine)",
	args: [positional("id").required().desc("Workspace UUID")],
	options: {
		host: string().desc("Host the workspace lives on (default: this machine)"),
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

		const target = resolveHostTarget({
			requestedHostId: options.host ?? getHostId(),
			organizationId,
			userJwt: ctx.bearer,
		});
		const updated = await target.client.workspace.update.mutate({
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
