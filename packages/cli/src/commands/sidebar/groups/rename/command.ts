import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { executeSidebarCommand, resolveGroup } from "../../shared";

export default command({
	description: "Rename a sidebar group",
	args: [
		positional("group").required().desc("Group name or ID"),
		positional("name").required().desc("New group name"),
	],
	run: async ({ ctx, args }) => {
		const before = await executeSidebarCommand(ctx, { action: "list" });
		const group = resolveGroup(before, args.group as string);
		const state = await executeSidebarCommand(ctx, {
			action: "rename-group",
			groupId: group.id,
			name: args.name as string,
		});
		return {
			data: { groupId: group.id, state },
			message: `Renamed sidebar group to "${args.name}"`,
		};
	},
});
