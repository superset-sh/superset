import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findHostWorkspace } from "../../../lib/host-workspaces";

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

		// Workspace records are host-owned: find the owning host across the
		// org's reachable hosts, then route the update to it.
		const { workspace, warnings } = await findHostWorkspace(
			{ api: ctx.api, organizationId, userJwt: ctx.bearer },
			id,
		);
		for (const warning of warnings) {
			process.stderr.write(`Warning: ${warning}\n`);
		}
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on any reachable host: ${id}`,
				"List workspaces with: superset workspaces list",
			);
		}

		const target = resolveHostTarget({
			requestedHostId: workspace.hostId,
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
