import type { ExecutionMode } from "@superset/local-db/schema/zod";
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
			executionMode?: ExecutionMode;
	  };

export interface WorkspaceRunPresetLike {
	id: string;
	name: string;
	commands: string[];
	cwd?: string;
	executionMode?: ExecutionMode;
	projectIds?: string[] | null;
	useAsWorkspaceRun?: boolean;
}

/**
 * How Workspace Run lays out a definition's commands.
 * - "single": one terminal running the commands chained with `&&`.
 * - "split-panes": one terminal per command, all in one tab.
 * - "tabs": one terminal per command, each in its own tab.
 */
export type WorkspaceRunLaunchLayout = "single" | "split-panes" | "tabs";

export interface WorkspaceRunLaunch {
	layout: WorkspaceRunLaunchLayout;
	/** One entry per terminal to create, in pane order. */
	commands: string[];
}

function nonEmptyCommands(commands: readonly string[] | null | undefined) {
	return (commands ?? []).filter((command) => command.trim().length > 0);
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
	commands: readonly string[] | null | undefined;
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
		...(preset.executionMode ? { executionMode: preset.executionMode } : {}),
	};
}

/**
 * Project config has no launch mode and a sequential script explicitly asks
 * for one shell, so both chain their commands. Every other terminal-script
 * mode keeps one command per terminal, the same as running the script from
 * the scripts bar, so long-running commands start concurrently.
 */
export function planWorkspaceRunLaunch(
	definition: WorkspaceRunDefinition | null | undefined,
): WorkspaceRunLaunch | null {
	if (!definition || definition.commands.length === 0) return null;
	const mode =
		definition.source === "terminal-preset"
			? definition.executionMode
			: undefined;
	if (
		definition.commands.length === 1 ||
		mode === undefined ||
		mode === "sequential"
	) {
		return { layout: "single", commands: [definition.commands.join(" && ")] };
	}
	return {
		layout: mode === "new-tab" ? "tabs" : "split-panes",
		commands: definition.commands,
	};
}

export function selectWorkspaceRunDefinition({
	presets,
	configRunCommands,
	projectId,
	configCwd,
}: {
	presets: readonly WorkspaceRunPresetLike[];
	configRunCommands?: readonly string[] | null;
	/** Null for project-less "session" workspaces — only global presets apply. */
	projectId: string | null;
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

	const configRun =
		projectId !== null
			? configRunToWorkspaceRun({
					projectId,
					commands: configRunCommands,
					cwd: configCwd,
				})
			: null;
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
