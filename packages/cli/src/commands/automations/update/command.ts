import { readFileSync } from "node:fs";
import { boolean, positional, string } from "@superset/cli-framework";
import {
	type AgentDefinitionId,
	indexResolvedAgentConfigs,
	type ResolvedAgentConfig,
	resolveAgentConfigs,
} from "@superset/shared/agent-settings";
import { command } from "../../../lib/command";

function loadAgentConfigFromFile(path: string): ResolvedAgentConfig {
	const raw = readFileSync(path, "utf-8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(
			`Failed to parse ${path} as JSON: ${(error as Error).message}`,
		);
	}
	const config = parsed as Partial<ResolvedAgentConfig>;
	if (!config || typeof config !== "object" || !config.id || !config.kind) {
		throw new Error(
			`Invalid agent config in ${path}: must include at least "id" and "kind"`,
		);
	}
	return parsed as ResolvedAgentConfig;
}

function resolveDefaultAgentConfig(agentId: string): ResolvedAgentConfig {
	const presets = indexResolvedAgentConfigs(resolveAgentConfigs({}));
	const config = presets.get(agentId as AgentDefinitionId);
	if (!config || !config.enabled) {
		throw new Error(`Unknown or disabled agent preset: ${agentId}`);
	}
	return config;
}

export default command({
	description: "Update an automation",
	args: [positional("id").required().desc("Automation id")],
	options: {
		name: string().desc("New name"),
		prompt: string().desc("New prompt"),
		promptFile: string().desc("Path to a file with the new prompt"),
		rrule: string().desc("New RRule body (RFC 5545)"),
		timezone: string().desc("New IANA timezone"),
		dtstart: string().desc("New ISO 8601 start anchor"),
		agent: string().desc(
			"New agent preset id (resolved from shipped defaults)",
		),
		agentConfigFile: string().desc(
			"Path to a JSON file with a full ResolvedAgentConfig (overrides --agent)",
		),
		device: string().desc("New target host id"),
		enabled: boolean().desc("Enable or pause the automation"),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const promptFromFile = options.promptFile
			? readFileSync(options.promptFile, "utf-8").trim()
			: undefined;
		const prompt = options.prompt ?? promptFromFile;

		if (options.enabled !== undefined) {
			await ctx.api.automation.setEnabled.mutate({
				id,
				enabled: options.enabled,
			});
		}

		const agentConfig = options.agentConfigFile
			? loadAgentConfigFromFile(options.agentConfigFile)
			: options.agent
				? resolveDefaultAgentConfig(options.agent)
				: undefined;

		const result = await ctx.api.automation.update.mutate({
			id,
			name: options.name,
			prompt,
			rrule: options.rrule,
			timezone: options.timezone,
			dtstart: options.dtstart ? new Date(options.dtstart) : undefined,
			agentConfig,
			targetHostId: options.device,
		});

		return {
			data: result,
			message: `Updated automation "${result.name}"`,
		};
	},
});
