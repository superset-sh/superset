import { table } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	description: "List task statuses in the active organization",
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["name", "type", "position", "id"],
			["NAME", "TYPE", "POS", "ID"],
		),
	run: async ({ ctx }) => {
		return ctx.api.task.statuses.list.query();
	},
});
