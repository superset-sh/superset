import { CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { linearTeam, linearWorkspace } from "../../linear";
import {
	requireOrganizationId,
	resolveTracker,
	trackerOption,
} from "../../tracker";

export default command({
	description: "List task statuses in the active organization",
	options: {
		tracker: trackerOption,
		team: string().desc("Linear team key (Linear only)"),
	},
	display: (data) => {
		const rows = data as Record<string, unknown>[];
		return rows.some((row) => "team" in row)
			? table(
					rows,
					["team", "name", "type", "position", "id"],
					["TEAM", "NAME", "TYPE", "POS", "ID"],
				)
			: table(
					rows,
					["name", "type", "position", "id"],
					["NAME", "TYPE", "POS", "ID"],
				);
	},
	run: async ({ ctx, options }) => {
		if ((await resolveTracker(ctx, options.tracker)) === "linear") {
			const workspace = await linearWorkspace(ctx, requireOrganizationId(ctx));
			const teams = options.team
				? [linearTeam(workspace, options.team)]
				: workspace.teams;
			return teams.flatMap((team) =>
				team.states.map((state) => ({ team: team.key, ...state })),
			);
		}
		if (options.team) {
			throw new CLIError("--team only applies to Linear issues");
		}
		return ctx.api.task.statuses.list.query();
	},
});
