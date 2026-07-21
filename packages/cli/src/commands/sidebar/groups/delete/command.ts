import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { executeSidebarCommand, resolveGroup } from "../../shared";

export default command({
	description: "Delete a group and leave its workspaces ungrouped",
	args: [positional("group").required().desc("Group name or ID")],
	run: async ({ ctx, args }) => {
		const before = await executeSidebarCommand(ctx, { action: "list" });
		const group = resolveGroup(before, args.group as string);
		const state = await executeSidebarCommand(ctx, {
			action: "delete-group",
			groupId: group.id,
		});
		return {
			data: { deletedGroupId: group.id, state },
			message: `Deleted sidebar group "${group.name}"; its workspaces are now ungrouped`,
		};
	},
});
