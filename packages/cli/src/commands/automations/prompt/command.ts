import { readFileSync } from "node:fs";
import { positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks).toString("utf-8");
}

export default command({
	description:
		"Read or write an automation's prompt. Reads to stdout by default; writes when --from-file is given or stdin is piped.",
	args: [positional("id").required().desc("Automation id")],
	options: {
		fromFile: string().desc(
			"Path to a markdown file with the new prompt. Use '-' to read from stdin.",
		),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const stdinIsPiped = !process.stdin.isTTY;
		const useStdin =
			options.fromFile === "-" || (!options.fromFile && stdinIsPiped);

		if (options.fromFile && options.fromFile !== "-") {
			const next = readFileSync(options.fromFile, "utf-8");
			const result = await ctx.api.automation.setPrompt.mutate({
				id,
				prompt: next,
			});
			return {
				data: { id: result.id, name: result.name, length: next.length },
				message: `Updated prompt for "${result.name}" (${next.length} chars).`,
			};
		}

		if (useStdin) {
			const next = await readStdin();
			if (!next.trim()) {
				throw new Error("Refusing to write an empty prompt from stdin.");
			}
			const result = await ctx.api.automation.setPrompt.mutate({
				id,
				prompt: next,
			});
			return {
				data: { id: result.id, name: result.name, length: next.length },
				message: `Updated prompt for "${result.name}" (${next.length} chars).`,
			};
		}

		const { prompt } = await ctx.api.automation.getPrompt.query({ id });
		return { data: { id, prompt } };
	},
	display: (data) => {
		const obj = data as { id: string; prompt?: string };
		return obj.prompt ?? "";
	},
});
