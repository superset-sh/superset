import { isAgentMode, positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	description: "Print an automation's prompt to stdout",
	args: [positional("id").required().desc("Automation id")],
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const { prompt } = await ctx.api.automation.getPrompt.query({ id });
		// `--quiet` is intentionally ignored here: it would route through
		// `extractIds` and emit only the UUID (which the caller already has
		// as input), discarding the prompt body. Plain stdout is the right
		// "machine-friendly" output for this command.
		const globals = options as Record<string, unknown>;
		if (globals.json === true || isAgentMode()) {
			return { data: { id, prompt } };
		}
		// Default: write the raw prompt with no trailing newline so that
		// `prompt get <id> > out.md` round-trips byte-exactly with a
		// subsequent `prompt set <id> --from-file out.md`.
		process.stdout.write(prompt ?? "");
		return undefined;
	},
});
