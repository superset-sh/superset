import type { HostAgentConfig } from "@superset/host-service/settings";
import { getPresetById } from "@superset/shared/host-agent-presets";
import { getAgentCommandText } from "renderer/lib/agent-launch-command";
import type { TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

const DEFAULT_V2_TERMINAL_PRESET_IDS = [
	"claude",
	"codex",
	"opencode",
	"omp",
	"copilot",
	"vibe",
	"kimi",
	"grok",
] as const;

interface CreateDefaultV2TerminalPresetRowsInput {
	agents: readonly HostAgentConfig[];
	existingPresets: readonly TerminalPresetRow[];
	createId: () => string;
	createdAt: Date;
}

export function createDefaultTerminalPresetRows({
	agents,
	existingPresets,
	createId,
	createdAt,
}: CreateDefaultV2TerminalPresetRowsInput): TerminalPresetRow[] {
	if (existingPresets.length > 0) return [];

	let tabOrder = 0;
	return DEFAULT_V2_TERMINAL_PRESET_IDS.flatMap((presetId) => {
		const agent = agents.find(
			(candidate) =>
				candidate.presetId === presetId && candidate.command.trim().length > 0,
		);
		const preset = getPresetById(presetId);
		if (!agent || !preset) return [];

		const row: TerminalPresetRow = {
			id: createId(),
			name: agent.label,
			description: preset.description,
			cwd: "",
			commands: [getAgentCommandText(agent)],
			projectIds: null,
			executionMode: "new-tab",
			tabOrder,
			createdAt,
			agentId: agent.id,
		};
		tabOrder += 1;
		return [row];
	});
}
