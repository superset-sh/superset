import type { AgentPresetOverrideEnvelope } from "@superset/local-db";
import { LEGACY_BUILTIN_TERMINAL_AGENT_OVERRIDES } from "@superset/shared/agent-permissions-migration";
import { parseCommandString } from "shared/argv";

export interface LegacyHostAgentMirrorEntry {
	presetId: string;
	command: string;
	args: string[];
}

/**
 * Translate the v1 `agent_preset_overrides` envelope into the per-host-agent
 * mirror plan that gets sent to host-service `agentConfigs.mirrorLegacyOverrides`.
 *
 * For each builtin terminal agent that has a legacy override `command` string
 * in the envelope (i.e. the user benefited from `runAgentPresetPermissionsMigration`),
 * we parse the v1 single-string command into `{ command, args }` so the host-service
 * — which stores the launch shape split — can apply it idempotently. See #4195.
 *
 * Pure function: no DB or IPC. Only tests for presence + valid parse; the host
 * service is responsible for the seed-default-still-matches idempotence check.
 */
export function buildLegacyHostAgentMirrorPlan(
	envelope: AgentPresetOverrideEnvelope,
): LegacyHostAgentMirrorEntry[] {
	const overridesById = new Map(
		envelope.presets.map((preset) => [preset.id, preset]),
	);
	const plan: LegacyHostAgentMirrorEntry[] = [];
	for (const presetId of Object.keys(LEGACY_BUILTIN_TERMINAL_AGENT_OVERRIDES)) {
		const override = overridesById.get(presetId);
		const commandString = override?.command;
		if (!commandString) continue;
		const { command, args } = parseCommandString(commandString);
		if (!command) continue;
		plan.push({ presetId, command, args });
	}
	return plan;
}
