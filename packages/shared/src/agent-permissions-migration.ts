import type {
	AgentPresetOverride,
	AgentPresetOverrideEnvelope,
} from "./agent-custom";

type LegacyBuiltinAgentId =
	| "claude"
	| "codex"
	| "gemini"
	| "copilot"
	| "cursor-agent";

interface LegacyAgentOverride {
	command?: string;
	promptCommand?: string;
	promptCommandSuffix?: string;
}

/**
 * Pre-#3546 (canary) builtin terminal agent command strings. Used once, at
 * the agent-preset permissions backfill, to restore YOLO-style defaults for
 * users who were exposed to the old values before we swapped in safer ones.
 * See runAgentPresetPermissionsMigration in the settings router.
 */
export const LEGACY_BUILTIN_TERMINAL_AGENT_OVERRIDES: Readonly<
	Record<LegacyBuiltinAgentId, LegacyAgentOverride>
> = Object.freeze({
	claude: {
		command: "claude --dangerously-skip-permissions",
	},
	codex: {
		command:
			'codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
		promptCommand:
			'codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true --',
	},
	gemini: {
		command: "gemini --yolo",
		promptCommand: "gemini",
		promptCommandSuffix: "--yolo",
	},
	copilot: {
		command: "copilot --allow-all",
		promptCommand: "copilot --allow-all -i",
		promptCommandSuffix: "--yolo",
	},
	"cursor-agent": {
		promptCommandSuffix: "--yolo",
	},
});

/**
 * Exact full-string matches for the pre-#3546 builtin `command` field of the
 * four agents seeded into a user's terminal-preset row on first app open. If
 * any of a user's stored terminal-preset commands matches one of these
 * strings, they were seeded on a pre-#3546 build and are an "existing user"
 * for the permissions backfill. Substring matching would false-positive on
 * user-authored commands that happen to contain `--yolo` etc.
 */
const LEGACY_SEEDED_TERMINAL_PRESET_COMMAND_STRINGS = new Set<string>([
	LEGACY_BUILTIN_TERMINAL_AGENT_OVERRIDES.claude.command,
	LEGACY_BUILTIN_TERMINAL_AGENT_OVERRIDES.codex.command,
	LEGACY_BUILTIN_TERMINAL_AGENT_OVERRIDES.gemini.command,
	LEGACY_BUILTIN_TERMINAL_AGENT_OVERRIDES.copilot.command,
] as string[]);

export function terminalPresetsMatchPre3546Seed(
	presets: ReadonlyArray<{ commands?: string[] }> | null | undefined,
): boolean {
	if (!presets) return false;
	return presets.some((preset) =>
		preset.commands?.some((command) =>
			LEGACY_SEEDED_TERMINAL_PRESET_COMMAND_STRINGS.has(command),
		),
	);
}

/**
 * Merge pre-#3546 command strings into the user's override envelope for each
 * affected builtin agent, but only for fields the user hasn't already set
 * themselves (so their own customizations always win).
 */
export function applyLegacyPermissionsOverrides(
	currentEnvelope: AgentPresetOverrideEnvelope,
): AgentPresetOverrideEnvelope {
	const nextById = new Map(
		currentEnvelope.presets.map((preset) => [preset.id, preset]),
	);

	for (const [agentId, legacy] of Object.entries(
		LEGACY_BUILTIN_TERMINAL_AGENT_OVERRIDES,
	)) {
		const existing: AgentPresetOverride = nextById.get(agentId) ?? {
			id: agentId,
		};
		const next: AgentPresetOverride = { ...existing, id: agentId };

		if (legacy.command !== undefined && !Object.hasOwn(existing, "command")) {
			next.command = legacy.command;
		}
		if (
			legacy.promptCommand !== undefined &&
			!Object.hasOwn(existing, "promptCommand")
		) {
			next.promptCommand = legacy.promptCommand;
		}
		if (
			legacy.promptCommandSuffix !== undefined &&
			!Object.hasOwn(existing, "promptCommandSuffix")
		) {
			next.promptCommandSuffix = legacy.promptCommandSuffix;
		}

		nextById.set(agentId, next);
	}

	return {
		version: 1,
		presets: Array.from(nextById.values()),
	};
}
