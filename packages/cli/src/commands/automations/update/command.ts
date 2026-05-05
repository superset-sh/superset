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
	description: "Update an automation's metadata (name, schedule, agent, host)",
	args: [positional("id").required().desc("Automation id")],
	options: {
		name: string().desc("New name"),
		rrule: string().desc("New RRule body (RFC 5545)"),
		timezone: string().desc("New IANA timezone"),
		dtstart: string().desc("New ISO 8601 start anchor"),
		agent: string().desc(
			"New agent preset id (resolved from shipped defaults)",
		),
		agentConfigFile: string().desc(
			"Path to a JSON file with a full ResolvedAgentConfig (overrides --agent)",
		),
		host: string().desc("New target host id"),
		project: string().desc("New v2 project id"),
		workspace: string().desc("New v2 workspace id"),
		mcpScope: string().desc("Comma-separated MCP scope strings"),
		enabled: boolean().desc("Enable or pause the automation"),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;

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

		const mcpScope =
			options.mcpScope !== undefined
				? options.mcpScope
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean)
				: undefined;

		const result = await ctx.api.automation.update.mutate({
			id,
			name: options.name,
			rrule: options.rrule,
			timezone: options.timezone,
			dtstart: options.dtstart ? new Date(options.dtstart) : undefined,
			agentConfig,
			...(options.host !== undefined ? { targetHostId: options.host } : {}),
			...(options.project !== undefined
				? { v2ProjectId: options.project }
				: {}),
			...(options.workspace !== undefined
				? { v2WorkspaceId: options.workspace }
				: {}),
			...(mcpScope !== undefined ? { mcpScope } : {}),
		});

		return {
			data: result,
			message: `Updated automation "${result.name}"`,
		};
	},
});
