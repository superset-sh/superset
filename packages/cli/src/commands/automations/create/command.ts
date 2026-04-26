import { readFileSync } from "node:fs";
import { string } from "@superset/cli-framework";
import {
	type AgentDefinitionId,
	indexResolvedAgentConfigs,
	type ResolvedAgentConfig,
	resolveAgentConfigs,
} from "@superset/shared/agent-settings";
import { command } from "../../../lib/command";
import { formatAutomationDate } from "../format";

const DEFAULT_TIMEZONE =
	Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

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
	description: "Create a scheduled automation",
	options: {
		name: string().required().desc("Human-readable automation name"),
		prompt: string().desc("Prompt to send to the agent"),
		promptFile: string().desc("Path to a file containing the prompt"),
		rrule: string()
			.required()
			.desc(
				"RFC 5545 RRULE body, e.g. FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
			),
		timezone: string().desc(`IANA timezone (default: host TZ, else UTC)`),
		dtstart: string().desc("ISO 8601 start anchor (default: now)"),
		project: string().desc(
			"v2 project id — required for new-workspace-per-run mode",
		),
		workspace: string().desc("existing v2 workspace id — reuses it every run"),
		device: string().desc("Target host id (default: owner's online host)"),
		agent: string()
			.default("claude")
			.desc("Agent preset id — resolved against shipped defaults"),
		agentConfigFile: string().desc(
			"Path to a JSON file with a full ResolvedAgentConfig (overrides --agent)",
		),
	},
	run: async ({ ctx, options }) => {
		const prompt = options.prompt
			? options.prompt
			: options.promptFile
				? readFileSync(options.promptFile, "utf-8").trim()
				: null;
		if (!prompt) {
			throw new Error("Provide --prompt <text> or --prompt-file <path>");
		}

		if (!options.project) {
			throw new Error("Provide --project (required)");
		}

		const agentConfig = options.agentConfigFile
			? loadAgentConfigFromFile(options.agentConfigFile)
			: resolveDefaultAgentConfig(options.agent);

		const result = await ctx.api.automation.create.mutate({
			name: options.name,
			prompt,
			agentConfig,
			targetHostId: options.device ?? null,
			v2ProjectId: options.project,
			v2WorkspaceId: options.workspace ?? null,
			rrule: options.rrule,
			dtstart: options.dtstart ? new Date(options.dtstart) : undefined,
			timezone: options.timezone ?? DEFAULT_TIMEZONE,
			mcpScope: [],
		});

		return {
			data: result,
			message: `Created automation "${result.name}" (${result.id})\nNext run: ${formatAutomationDate(result.nextRunAt, result.timezone)}`,
		};
	},
});
