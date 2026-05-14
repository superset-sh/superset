import {
	filterMatchingPresetsForProject,
	isProjectTargetedPreset,
} from "./preset-project-targeting";

export type WorkspaceRunDefinition =
	| {
			source: "project-config";
			projectId: string;
			commands: string[];
			cwd?: string;
	  }
	| {
			source: "terminal-preset";
			presetId: string;
			name: string;
			commands: string[];
			cwd?: string;
	  };

export interface WorkspaceRunPresetLike {
	id: string;
	name: string;
	commands: unknown[];
	cwd?: string;
	projectIds?: string[] | null;
	useAsWorkspaceRun?: boolean;
}

function nonEmptyCommands(commands: readonly unknown[] | null | undefined) {
	return (commands ?? []).filter(
		(command): command is string =>
			typeof command === "string" && command.trim().length > 0,
	);
}

function normalizeCwd(cwd: string | undefined): string | undefined {
	const trimmed = cwd?.trim();
	return trimmed ? trimmed : undefined;
}

export function configRunToWorkspaceRun({
	projectId,
	commands,
	cwd,
}: {
	projectId: string;
	commands: readonly unknown[] | null | undefined;
	cwd?: string;
}): WorkspaceRunDefinition | null {
	const resolvedCommands = nonEmptyCommands(commands);
	if (resolvedCommands.length === 0) return null;
	return {
		source: "project-config",
		projectId,
		commands: resolvedCommands,
		cwd: normalizeCwd(cwd),
	};
}

export function presetToWorkspaceRun(
	preset: WorkspaceRunPresetLike,
): WorkspaceRunDefinition | null {
	if (!preset.useAsWorkspaceRun) return null;
	const commands = nonEmptyCommands(preset.commands);
	if (commands.length === 0) return null;
	return {
		source: "terminal-preset",
		presetId: preset.id,
		name: preset.name,
		commands,
		cwd: normalizeCwd(preset.cwd),
	};
}

export function selectWorkspaceRunDefinition({
	presets,
	configRunCommands,
	projectId,
	configCwd,
}: {
	presets: readonly WorkspaceRunPresetLike[];
	configRunCommands?: readonly unknown[] | null;
	projectId: string;
	configCwd?: string;
}): WorkspaceRunDefinition | null {
	const matchingPresets = filterMatchingPresetsForProject(presets, projectId);
	const targetedPresetRun = matchingPresets
		.filter(isProjectTargetedPreset)
		.map(presetToWorkspaceRun)
		.find((definition): definition is WorkspaceRunDefinition =>
			Boolean(definition),
		);
	if (targetedPresetRun) return targetedPresetRun;

	const configRun = configRunToWorkspaceRun({
		projectId,
		commands: configRunCommands,
		cwd: configCwd,
	});
	if (configRun) return configRun;

	return (
		matchingPresets
			.filter((preset) => !isProjectTargetedPreset(preset))
			.map(presetToWorkspaceRun)
			.find((definition): definition is WorkspaceRunDefinition =>
				Boolean(definition),
			) ?? null
	);
}
