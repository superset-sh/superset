import { boolean, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { skillsRoot } from "../../../lib/plugins/host";
import { listSkills } from "../../../lib/plugins/install";

export default command({
	description: "List skills installed from plugins, with the path of each",
	options: {
		paths: boolean().desc("Print only the paths, one per line"),
	},
	skipMiddleware: true,
	display: (data) => {
		const rows = (data ?? []) as unknown[];
		if (rows.length > 0 && rows.every((row) => typeof row === "string")) {
			return (rows as string[]).join("\n");
		}
		return table(
			rows as Record<string, unknown>[],
			["directory", "plugin", "path"],
			["SKILL", "PLUGIN", "PATH"],
			[30, 16, 54],
		);
	},
	run: async ({ options }) => {
		const skills = listSkills();

		if (options.paths) {
			return {
				data: skills.map((s) => s.path),
				message: skills.map((s) => s.path).join("\n"),
			};
		}

		return {
			data: skills.map((skill) => ({
				directory: skill.directory,
				plugin: skill.plugin,
				skill: skill.skill,
				marketplace: skill.marketplace,
				path: skill.path,
				description: skill.description,
			})),
			message: skills.length
				? `${skills.length} skill${skills.length === 1 ? "" : "s"} in ${skillsRoot()}.`
				: `No skills installed. Install a plugin with: superset plugins install <name>`,
		};
	},
});
