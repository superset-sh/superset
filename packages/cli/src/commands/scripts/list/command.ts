import { table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	listTerminalScripts,
	type PublicTerminalScript,
	toPublicTerminalScript,
} from "../../../lib/terminal-scripts";

export default command({
	description: "List terminal scripts on this machine",
	skipMiddleware: true,
	display: (data) =>
		table(
			(data as PublicTerminalScript[]).map((script) => ({
				id: script.id,
				name: script.name,
				commands: script.commands.join(" ; "),
				projects: script.projectIds
					? `${script.projectIds.length} project${script.projectIds.length === 1 ? "" : "s"}`
					: "all",
				pinned: script.pinnedToBar === false ? "no" : "yes",
				status: script.status,
			})),
			["id", "name", "commands", "projects", "pinned", "status"],
			["ID", "NAME", "COMMANDS", "PROJECTS", "PINNED", "STATUS"],
			[36, 24, 60, 10, 6, 9],
		),
	run: async () => ({
		data: listTerminalScripts().map(toPublicTerminalScript),
	}),
});
