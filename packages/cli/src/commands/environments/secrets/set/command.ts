import { readFileSync } from "node:fs";
import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { isAgentCredentialEnvName } from "@superset/shared/agent-credentials";
import { parseEnvContent } from "@superset/shared/env-file";
import { command } from "../../../../lib/command";
import { resolveEnvironment } from "../../../../lib/environments";

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks).toString("utf-8");
}

export default command({
	description:
		"Set a variable on an environment, from --body, stdin, or a .env file",
	args: [
		positional("name").desc("Variable name; omit when passing --env-file"),
	],
	options: {
		body: string().alias("b").desc("The value; read from stdin when omitted"),
		envFile: string()
			.alias("f")
			.desc("Set every variable in a .env file instead of one name"),
		visible: boolean().desc(
			"Store it readable in settings instead of as a secret",
		),
		environment: string().desc(
			"Environment (id or name); required when the organization has several",
		),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const name = args.name as string | undefined;
		if (options.envFile && (name || options.body)) {
			throw new CLIError("Pass either --env-file or a name with a value");
		}
		if (!options.envFile && !name) {
			throw new CLIError(
				"Provide a variable name, or --env-file to set several",
			);
		}

		let entries: Array<{ key: string; value: string }>;
		if (options.envFile) {
			entries = parseEnvContent(readFileSync(options.envFile, "utf-8"));
			if (entries.length === 0) {
				throw new CLIError(`No variables found in ${options.envFile}`);
			}
		} else {
			const value =
				options.body ?? (process.stdin.isTTY ? undefined : await readStdin());
			if (value === undefined) {
				throw new CLIError(
					"No value given",
					`Pass --body, or pipe it: printf '%s' "$VALUE" | superset environments secrets set ${name}`,
				);
			}
			entries = [{ key: name as string, value }];
		}

		const environment = await resolveEnvironment(
			ctx.api,
			organizationId,
			options.environment,
		);
		for (const entry of entries) {
			await ctx.api.environment.secrets.set.mutate({
				environmentId: environment.id,
				key: entry.key,
				value: entry.value,
				sensitive: !options.visible,
			});
		}
		const keys = entries.map((entry) => entry.key);
		const agentKeys = keys.filter(isAgentCredentialEnvName);
		const warnings =
			agentKeys.length === 0
				? []
				: [
						`Agents never read ${agentKeys.join(", ")} here; they sign in under Settings › Agents. A headless claude -p or codex run on a workspace still bills this key.`,
					];
		const set =
			keys.length === 1
				? `Set ${keys[0]} on ${environment.name}`
				: `Set ${keys.length} variables on ${environment.name}: ${keys.join(", ")}`;
		return {
			data: { environment: environment.name, keys, warnings },
			message: [set, ...warnings.map((warning) => `Warning: ${warning}`)].join(
				"\n",
			),
		};
	},
});
