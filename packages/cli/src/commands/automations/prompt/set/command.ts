import { readFileSync } from "node:fs";
import { positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks).toString("utf-8");
}

export default command({
	description: "Replace an automation's prompt from a file or stdin",
	args: [positional("id").required().desc("Automation id")],
	options: {
		fromFile: string()
			.required()
			.desc(
				"Path to a markdown file with the new prompt. Use '-' to read from stdin.",
			),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const next =
			options.fromFile === "-"
				? await readStdin()
				: readFileSync(options.fromFile, "utf-8");

		if (!next.trim()) {
			throw new Error("Refusing to write an empty prompt.");
		}

		const result = await ctx.api.automation.setPrompt.mutate({
			id,
			prompt: next,
		});
		return {
			data: { id: result.id, name: result.name, length: next.length },
			message: `Updated prompt for "${result.name}" (${next.length} chars).`,
		};
	},
});
