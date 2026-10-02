import {
	generateBashCompletion,
	generateZshCompletion,
	introspectCli,
	positional,
} from "@superset/cli-framework";
import { command } from "../../lib/command";

export default command({
	description:
		"Print a shell completion script; load it with: source <(superset completion zsh)",
	skipMiddleware: true,
	args: [
		positional("shell")
			.enum("bash", "zsh")
			.required()
			.desc("Shell to generate the script for"),
	],
	run: async ({ args }) => {
		const generate =
			args.shell === "zsh" ? generateZshCompletion : generateBashCompletion;
		return { raw: generate(introspectCli()) };
	},
});
