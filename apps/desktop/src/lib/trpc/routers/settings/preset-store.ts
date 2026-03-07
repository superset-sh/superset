import { settings, type TerminalPreset } from "@superset/local-db";
import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
} from "@superset/shared/agent-command";
import { localDb } from "main/lib/local-db";
import {
	normalizeTerminalPresets,
	type PresetWithUnknownMode,
} from "./preset-execution-mode";

function getOrCreateSettingsRow() {
	let row = localDb.select().from(settings).get();
	if (!row) {
		row = localDb.insert(settings).values({ id: 1 }).returning().get();
	}
	return row;
}

export function readRawTerminalPresets(): PresetWithUnknownMode[] {
	const row = getOrCreateSettingsRow();
	return (row.terminalPresets ?? []) as PresetWithUnknownMode[];
}

export function getNormalizedTerminalPresets(): TerminalPreset[] {
	return normalizeTerminalPresets(readRawTerminalPresets());
}

export function saveTerminalPresets(
	presets: TerminalPreset[],
	options?: { terminalPresetsInitialized?: boolean },
) {
	const values = { id: 1, terminalPresets: presets, ...options };
	localDb
		.insert(settings)
		.values(values)
		.onConflictDoUpdate({
			target: settings.id,
			set: { terminalPresets: presets, ...options },
		})
		.run();
}

const DEFAULT_PRESET_AGENTS = [
	"claude",
	"codex",
	"copilot",
	"opencode",
	"gemini",
] as const;

const DEFAULT_PRESETS: Omit<TerminalPreset, "id">[] = DEFAULT_PRESET_AGENTS.map(
	(name) => ({
		name,
		description: AGENT_PRESET_DESCRIPTIONS[name],
		cwd: "",
		commands: AGENT_PRESET_COMMANDS[name],
	}),
);

export function getTerminalPresetsEnsuringInitialized(): TerminalPreset[] {
	const row = getOrCreateSettingsRow();
	if (row.terminalPresetsInitialized) {
		return getNormalizedTerminalPresets();
	}

	const existingPresets = getNormalizedTerminalPresets();

	const mergedPresets =
		existingPresets.length > 0
			? existingPresets
			: DEFAULT_PRESETS.map((preset) => ({
					id: crypto.randomUUID(),
					...preset,
					executionMode: preset.executionMode ?? "split-pane",
				}));

	saveTerminalPresets(mergedPresets, { terminalPresetsInitialized: true });

	return mergedPresets;
}
