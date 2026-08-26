import type { ExecutionMode, TerminalPreset } from "@superset/local-db";
import { updateSettingsAtomically } from "./settings";

export interface CreateTerminalScriptInput {
	organizationId: string;
	name: string;
	description?: string;
	cwd?: string;
	commands: string[];
	projectIds?: string[];
	pinnedToBar?: boolean;
	useAsWorkspaceRun?: boolean;
	executionMode?: ExecutionMode;
}

/**
 * Persist a user-authored terminal script in the desktop's legacy-compatible
 * terminal_presets field. "Preset" remains the storage/API term so current
 * and older desktop builds can read scripts created by the CLI.
 */
export function createTerminalScript(
	input: CreateTerminalScriptInput,
	createId: () => string = () => crypto.randomUUID(),
): TerminalPreset {
	const script: TerminalPreset = {
		id: createId(),
		name: input.name.trim(),
		description: input.description?.trim() || undefined,
		cwd: input.cwd?.trim() ?? "",
		commands: input.commands.map((command) => command.trim()),
		projectIds:
			input.projectIds && input.projectIds.length > 0
				? [...new Set(input.projectIds)]
				: null,
		pinnedToBar: input.pinnedToBar ?? true,
		useAsWorkspaceRun: input.useAsWorkspaceRun || undefined,
		executionMode: input.executionMode ?? "new-tab",
		cliImportPending: true,
		cliTargetOrganizationId: input.organizationId,
	};

	return updateSettingsAtomically((row) => ({
		patch: { terminalPresets: [...(row?.terminalPresets ?? []), script] },
		result: script,
	}));
}
