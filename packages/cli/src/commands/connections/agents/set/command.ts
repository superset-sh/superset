import * as p from "@clack/prompts";
import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks).toString("utf-8");
}

export default command({
	sandbox: false,
	description:
		"Store an agent's subscription token or API key for your cloud workspaces; read from stdin or a prompt",
	args: [positional("agent").required().desc("Agent: claude or codex")],
	options: {
		kind: string()
			.enum("subscription", "api_key")
			.required()
			.desc(
				"subscription: the token from `claude setup-token`; api_key: a provider or gateway key",
			),
		gateway: boolean().desc("The key is a Vercel AI Gateway key"),
		baseUrl: string().desc("A compatible endpoint the key is for"),
	},
	run: async ({ ctx, args, options }) => {
		const agent = args.agent as string;
		const hint =
			options.kind === "subscription" && agent === "claude"
				? "Run `claude setup-token` and paste the token it prints"
				: `Paste the ${agent} ${options.kind === "subscription" ? "token" : "API key"}`;
		let value: string | undefined;
		if (!process.stdin.isTTY) {
			value = await readStdin();
		} else {
			const entered = await p.password({ message: hint });
			if (p.isCancel(entered)) throw new CLIError("Cancelled");
			value = entered;
		}
		if (!value?.trim()) {
			throw new CLIError(
				"No value given",
				`${hint}, or pipe it: printf '%s' "$TOKEN" | superset connections agents set ${agent} --kind ${options.kind}`,
			);
		}
		const saved = await ctx.api.agentCredential.set.mutate({
			agent,
			kind: options.kind,
			value,
			baseUrl: options.baseUrl,
			provider: options.gateway ? "gateway" : undefined,
		});
		return {
			data: saved,
			message: `Signed ${saved.agent} in for your cloud workspaces (${saved.kind})`,
		};
	},
});
