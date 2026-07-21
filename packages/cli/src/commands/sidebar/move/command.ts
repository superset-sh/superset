import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	executeSidebarCommand,
	getLocalSidebarClient,
	resolveGroup,
	resolveWorkspace,
} from "../shared";

export default command({
	description: "Move a workspace into a group or back to the project root",
	args: [positional("workspace").required().desc("Workspace name or ID")],
	options: {
		group: string().desc("Destination group name or ID"),
		ungrouped: boolean().desc("Move to the project's ungrouped area"),
	},
	run: async ({ ctx, args, options }) => {
		if ((options.group !== undefined) === options.ungrouped) {
			throw new CLIError(
				"Choose exactly one destination",
				"Pass --group <name-or-id> or --ungrouped",
			);
		}
		const client = getLocalSidebarClient(ctx);
		const [before, workspaces] = await Promise.all([
			executeSidebarCommand(ctx, { action: "list" }),
			client.workspace.list.query(),
		]);
		const workspace = resolveWorkspace(workspaces, args.workspace as string);
		const group = options.group
			? resolveGroup(before, options.group, workspace.projectId)
			: null;
		const state = await executeSidebarCommand(ctx, {
			action: "move-workspace",
			workspaceId: workspace.id,
			groupId: group?.id ?? null,
		});
		return {
			data: { workspaceId: workspace.id, groupId: group?.id ?? null, state },
			message: group
				? `Moved "${workspace.name}" into "${group.name}"`
				: `Moved "${workspace.name}" to the ungrouped area`,
		};
	},
});
