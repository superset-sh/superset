import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EXECUTION_MODES, type TerminalPreset } from "@superset/local-db";
import { PRESETS_FILE_NAME, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";
import { z } from "zod";
import {
	normalizeTerminalPresets,
	type PresetWithUnknownMode,
} from "./preset-execution-mode";

const SHARED_PRESET_ID_PREFIX = "shared:";

const sharedPresetSchema = z.object({
	slug: z.string().trim().min(1),
	name: z.string(),
	description: z.string().optional(),
	cwd: z.string().optional(),
	commands: z.array(z.string()),
	pinnedToBar: z.boolean().optional(),
	isDefault: z.boolean().optional(),
	applyOnWorkspaceCreated: z.boolean().optional(),
	applyOnNewTab: z.boolean().optional(),
	executionMode: z.unknown().optional(),
});

const sharedPresetFileSchema = z.union([
	z.array(sharedPresetSchema),
	z.object({
		version: z.number().int().positive().optional(),
		presets: z.array(sharedPresetSchema),
	}),
]);

type SharedPresetInput = z.infer<typeof sharedPresetSchema>;

function isSupportedExecutionMode(value: unknown): boolean {
	return (
		typeof value === "string" &&
		(EXECUTION_MODES as readonly string[]).includes(value)
	);
}

function toSharedPreset(input: SharedPresetInput): PresetWithUnknownMode {
	return {
		id: getSharedPresetId(input.slug),
		name: input.name,
		description: input.description,
		cwd: input.cwd ?? "",
		commands: input.commands,
		pinnedToBar: input.pinnedToBar,
		isDefault: input.isDefault,
		applyOnWorkspaceCreated: input.applyOnWorkspaceCreated,
		applyOnNewTab: input.applyOnNewTab,
		executionMode: isSupportedExecutionMode(input.executionMode)
			? input.executionMode
			: undefined,
	};
}

function comparablePreset(preset: TerminalPreset) {
	return {
		name: preset.name,
		description: preset.description,
		cwd: preset.cwd,
		commands: preset.commands,
		pinnedToBar: preset.pinnedToBar,
		isDefault: preset.isDefault,
		applyOnWorkspaceCreated: preset.applyOnWorkspaceCreated,
		applyOnNewTab: preset.applyOnNewTab,
		executionMode: preset.executionMode,
	};
}

function arePresetFieldsEqual(a: TerminalPreset, b: TerminalPreset): boolean {
	return (
		JSON.stringify(comparablePreset(a)) === JSON.stringify(comparablePreset(b))
	);
}

export function getSharedPresetId(slug: string): string {
	return `${SHARED_PRESET_ID_PREFIX}${slug}`;
}

export function isSharedPresetId(presetId: string): boolean {
	return presetId.startsWith(SHARED_PRESET_ID_PREFIX);
}

export function loadSharedTerminalPresets(
	mainRepoPath: string,
): TerminalPreset[] {
	const presetsPath = join(
		mainRepoPath,
		PROJECT_SUPERSET_DIR_NAME,
		PRESETS_FILE_NAME,
	);

	if (!existsSync(presetsPath)) {
		return [];
	}

	let parsedJson: unknown;
	try {
		const content = readFileSync(presetsPath, "utf-8");
		parsedJson = JSON.parse(content);
	} catch (error) {
		console.error(
			`[settings] Failed to parse ${PROJECT_SUPERSET_DIR_NAME}/${PRESETS_FILE_NAME}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}

	const parsed = sharedPresetFileSchema.safeParse(parsedJson);
	if (!parsed.success) {
		console.error(
			`[settings] Invalid ${PROJECT_SUPERSET_DIR_NAME}/${PRESETS_FILE_NAME} schema: ${parsed.error.message}`,
		);
		return [];
	}

	const rawPresets = Array.isArray(parsed.data)
		? parsed.data
		: parsed.data.presets;

	return normalizeTerminalPresets(rawPresets.map(toSharedPreset));
}

export function mergeSharedAndLocalTerminalPresets(
	sharedPresets: TerminalPreset[],
	localPresets: TerminalPreset[],
): TerminalPreset[] {
	if (sharedPresets.length === 0) {
		return localPresets;
	}

	const localById = new Map(localPresets.map((preset) => [preset.id, preset]));
	const merged: TerminalPreset[] = [];
	const sharedIds = new Set<string>();

	for (const sharedPreset of sharedPresets) {
		sharedIds.add(sharedPreset.id);
		const localOverride = localById.get(sharedPreset.id);
		if (localOverride) {
			merged.push(
				normalizeTerminalPresets([
					{ ...sharedPreset, ...localOverride, id: sharedPreset.id },
				])[0],
			);
		} else {
			merged.push(sharedPreset);
		}
	}

	for (const localPreset of localPresets) {
		if (!sharedIds.has(localPreset.id)) {
			merged.push(localPreset);
		}
	}

	return merged;
}

export function toLocalTerminalPresets(
	effectivePresets: TerminalPreset[],
	sharedPresets: TerminalPreset[],
): TerminalPreset[] {
	if (sharedPresets.length === 0) {
		return effectivePresets;
	}

	const sharedById = new Map(
		sharedPresets.map((preset) => [preset.id, preset]),
	);
	return effectivePresets.filter((preset) => {
		const sharedPreset = sharedById.get(preset.id);
		if (!sharedPreset) {
			return true;
		}
		return !arePresetFieldsEqual(preset, sharedPreset);
	});
}
