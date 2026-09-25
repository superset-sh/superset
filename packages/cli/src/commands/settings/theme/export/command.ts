import { writeFileSync } from "node:fs";
import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { exportTheme } from "../../../../lib/settings";

export default command({
	description:
		"Export a theme (built-in or custom) as JSON — a starting point for custom themes",
	args: [
		positional("id").required().desc("Theme id (see: settings theme list)"),
	],
	options: {
		out: string().desc("Write to a file instead of stdout"),
	},
	skipMiddleware: true,
	run: async ({ args, options }) => {
		const theme = exportTheme(args.id as string);
		const json = JSON.stringify(theme, null, 2);
		if (options.out) {
			try {
				writeFileSync(options.out, `${json}\n`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new CLIError(`Could not write ${options.out} (${message})`);
			}
			return {
				data: theme,
				message: `Exported "${theme.id}" to ${options.out}. Edit it, then: superset settings theme import '${options.out}'`,
			};
		}
		return { data: theme, message: json };
	},
});
