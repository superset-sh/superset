import type { CliContext } from "../../../lib/command";
import { executeSidebarCommand, resolveGroup } from "../shared";

export async function setGroupCollapsed(
	ctx: CliContext,
	groupInput: string,
	collapsed: boolean,
) {
	const before = await executeSidebarCommand(ctx, { action: "list" });
	const group = resolveGroup(before, groupInput);
	const state = await executeSidebarCommand(ctx, {
		action: "set-group-collapsed",
		groupId: group.id,
		collapsed,
	});
	return {
		data: { groupId: group.id, collapsed, state },
		message: `${collapsed ? "Collapsed" : "Expanded"} sidebar group "${group.name}"`,
	};
}
