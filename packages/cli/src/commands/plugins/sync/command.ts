import { table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { skillsRoot } from "../../../lib/plugins/host";
import { syncPlugins } from "../../../lib/plugins/install";

export default command({
	description:
		"Reconcile installed plugins with the skill directories agents read, adding, refreshing, and reaping skill folders",
	skipMiddleware: true,
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["directory", "plugin", "path"],
			["SKILL", "PLUGIN", "PATH"],
			[30, 16, 54],
		),
	run: async () => {
		const result = await syncPlugins();
		const reaped = result.removed
			? ` Reaped ${result.removed} stale skill folder${result.removed === 1 ? "" : "s"}.`
			: "";

		return {
			data: result.entries.map((entry) => ({
				directory: entry.directory,
				plugin: entry.plugin,
				path: entry.path,
			})),
			message: `Synced ${result.skills} skill${result.skills === 1 ? "" : "s"} from ${result.plugins} plugin${result.plugins === 1 ? "" : "s"} into ${skillsRoot()}.${reaped}`,
		};
	},
});
