import { readFileSync } from "node:fs";
import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { parseDuration, resolveSession, waitForSession } from "../shared";

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks).toString("utf8");
}

export async function resolvePrompt(
	positionals: string[],
	file: string | undefined,
	stdinIsPiped = !process.stdin.isTTY,
	readStdinInput: () => Promise<string> = readStdin,
): Promise<string> {
	const hasPositional = positionals.length > 0;
	const hasFile = file !== undefined;
	const stdinPrompt =
		stdinIsPiped || file === "-" ? await readStdinInput() : undefined;
	const hasPipedStdin =
		file !== "-" && stdinPrompt !== undefined && stdinPrompt.length > 0;
	const sourceCount =
		Number(hasPositional) + Number(hasFile) + Number(hasPipedStdin);
	if (sourceCount !== 1) {
		throw new CLIError(
			"Provide exactly one prompt source",
			"Use positional text, --file <path>, or piped stdin.",
		);
	}
	const prompt = hasPositional
		? positionals.join(" ")
		: hasFile
			? file === "-"
				? (stdinPrompt ?? "")
				: readFileSync(file, "utf8")
			: (stdinPrompt ?? "");
	if (!prompt.trim()) throw new CLIError("Refusing to send an empty prompt");
	return prompt;
}

export default command({
	description: "Send a follow-up prompt to a running agent session",
	args: [
		positional("sessionId").required().desc("Full terminal session id"),
		positional("prompt").variadic().desc("Follow-up prompt text"),
	],
	options: {
		host: string().desc("Target a specific host (machineId)"),
		local: boolean().desc("Target this machine"),
		file: string().desc("Read the prompt from a file; use - for stdin"),
		wait: boolean().desc("Wait for the resulting turn to settle"),
		timeout: string().default("5m").desc("Maximum --wait duration"),
	},
	run: async ({ ctx, args, options, signal }) => {
		const sessionId = args.sessionId as string;
		const prompt = await resolvePrompt(
			(args.prompt as string[] | undefined) ?? [],
			options.file ?? undefined,
		);
		const match = await resolveSession(
			ctx,
			{
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			},
			sessionId,
		);
		const accepted = await match.client.terminalAgents.send.mutate({
			terminalId: sessionId,
			prompt,
		});
		if (!options.wait) {
			return {
				data: { terminalId: sessionId, ...accepted },
				message: `Prompt accepted by session ${sessionId}`,
			};
		}

		const final = await waitForSession({
			match,
			statuses: new Set(["idle", "permission", "failed"]),
			timeoutMs: parseDuration(options.timeout),
			minEventAt: accepted.sentAt,
			signal,
		});
		const read =
			final.status === "exited"
				? null
				: await match.client.terminalAgents.read.query({
						terminalId: sessionId,
						lines: 120,
					});
		return {
			data: { terminalId: sessionId, accepted, final, read },
			message: read
				? `Session ${sessionId}: ${final.status}\n\n${read.output}`
				: `Session ${sessionId}: exited`,
		};
	},
});
