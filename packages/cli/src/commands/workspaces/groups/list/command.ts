import { table } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	readSidebarState,
	requireOrganizationId,
	toGroupRows,
} from "../../../../lib/sidebar-groups";

export default command({
	description:
		"List desktop sidebar workspace groups from the latest local app snapshot",
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["name", "workspaceCount", "workspaces", "projectId", "id"],
			["NAME", "WORKSPACES", "MEMBERS", "PROJECT", "ID"],
			[24, 10, 42, 36, 36],
		),
	run: async ({ ctx }) => {
		const organizationId = requireOrganizationId(ctx.config.organizationId);
		const state = readSidebarState(organizationId);
		const rows = toGroupRows(state);
		return rows;
	},
});
