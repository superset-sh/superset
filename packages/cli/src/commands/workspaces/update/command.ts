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
		tag: string()
			.variadic()
			.desc(
				"Replace the workspace's tag set. Repeatable. Each tag files the workspace into a sidebar folder of the same name",
			),
		clearTags: boolean().desc("Remove every tag from the workspace"),
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
		if (options.tag?.length && options.clearTags) {
			throw new CLIError(
				"Cannot combine --tag and --clear-tags",
				"Pass one or the other",
			);
		}

		const taskId = options.clearTask
			? null
			: options.taskId !== undefined
				? options.taskId
				: undefined;

		// --tag replaces the whole set (the host semantic); --clear-tags is [].
		const tags = options.clearTags
			? []
			: options.tag?.length
				? options.tag
				: undefined;

		if (
			options.name === undefined &&
			taskId === undefined &&
			tags === undefined
		) {
			throw new CLIError(
				"No fields to update",
				"Pass --name, --task-id, --clear-task, --tag, or --clear-tags",
			);
		}

		const target = await resolveHostTarget({
			requestedHostId: options.host ?? getHostId(),
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});
		const updated = await target.client.workspace.update.mutate({
			id,
			...(options.name !== undefined ? { name: options.name } : {}),
			...(taskId !== undefined ? { taskId } : {}),
			...(tags !== undefined ? { tags } : {}),
		});

		return {
			data: updated,
			message: `Updated workspace ${id}`,
		};
	},
});
