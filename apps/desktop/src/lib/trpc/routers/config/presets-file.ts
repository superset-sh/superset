import type { ExecutionMode, TerminalPreset } from "@superset/local-db";
import { z } from "zod";
import { normalizePresetExecutionMode } from "../settings/preset-execution-mode";

export const SHARED_PRESETS_FILE_SCHEMA_VERSION = 1 as const;
export const SHARED_PRESETS_FILE_APP = "superset" as const;

export interface SharedPreset {
	name: string;
	description?: string;
	cwd: string;
	commands: string[];
	executionMode?: ExecutionMode;
}

export interface SharedPresetsFile {
	schemaVersion: typeof SHARED_PRESETS_FILE_SCHEMA_VERSION;
	exportedAt: string;
	app: typeof SHARED_PRESETS_FILE_APP;
	presets: SharedPreset[];
}

export type SharedPresetPortableField =
	| "name"
	| "description"
	| "cwd"
	| "commands"
	| "executionMode";

export type SharedPresetImportAction = "create" | "update" | "unchanged";

export interface SharedPresetImportPreviewItem {
	index: number;
	name: string;
	description?: string;
	action: SharedPresetImportAction;
	changedFields: SharedPresetPortableField[];
	existingPresetId?: string;
	existingPresetName?: string;
}

interface RawSharedPreset {
	name: string;
	description?: string;
	cwd: string;
	commands: string[];
	executionMode?: unknown;
}

const rawSharedPresetSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	cwd: z.string(),
	commands: z.array(z.string()),
	executionMode: z.unknown().optional(),
});

const sharedPresetsFileSchema = z.object({
	schemaVersion: z.literal(SHARED_PRESETS_FILE_SCHEMA_VERSION),
	exportedAt: z.string(),
	app: z.literal(SHARED_PRESETS_FILE_APP),
	presets: z.array(z.unknown()),
});

function toNonEmptyDescription(
	description: string | undefined,
): string | undefined {
	if (description === undefined) {
		return undefined;
	}

	const trimmed = description.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function toSharedPreset(rawPreset: RawSharedPreset): SharedPreset | null {
	const normalizedName = rawPreset.name.trim();
	if (normalizedName.length === 0) {
		return null;
	}

	return {
		name: normalizedName,
		description: toNonEmptyDescription(rawPreset.description),
		cwd: rawPreset.cwd,
		commands: rawPreset.commands,
		executionMode: normalizePresetExecutionMode(rawPreset.executionMode),
	};
}

function toNameKey(name: string): string {
	return name.trim().toLowerCase();
}

function stringArraysEqual(left: string[], right: string[]): boolean {
	if (left.length !== right.length) {
		return false;
	}

	return left.every((value, index) => value === right[index]);
}

function isPortablePresetEqual(
	existingPreset: TerminalPreset,
	sharedPreset: SharedPreset,
): boolean {
	return (
		existingPreset.name === sharedPreset.name &&
		(existingPreset.description ?? undefined) ===
			(sharedPreset.description ?? undefined) &&
		existingPreset.cwd === sharedPreset.cwd &&
		stringArraysEqual(existingPreset.commands, sharedPreset.commands) &&
		normalizePresetExecutionMode(existingPreset.executionMode) ===
			normalizePresetExecutionMode(sharedPreset.executionMode)
	);
}

function getPortableFieldChanges(
	existingPreset: TerminalPreset,
	sharedPreset: SharedPreset,
): SharedPresetPortableField[] {
	const changedFields: SharedPresetPortableField[] = [];

	if (existingPreset.name !== sharedPreset.name) {
		changedFields.push("name");
	}

	if (
		(existingPreset.description ?? undefined) !==
		(sharedPreset.description ?? undefined)
	) {
		changedFields.push("description");
	}

	if (existingPreset.cwd !== sharedPreset.cwd) {
		changedFields.push("cwd");
	}

	if (!stringArraysEqual(existingPreset.commands, sharedPreset.commands)) {
		changedFields.push("commands");
	}

	if (
		normalizePresetExecutionMode(existingPreset.executionMode) !==
		normalizePresetExecutionMode(sharedPreset.executionMode)
	) {
		changedFields.push("executionMode");
	}

	return changedFields;
}

export function createSharedPresetsFile(
	presets: TerminalPreset[],
	exportedAt = new Date().toISOString(),
): { file: SharedPresetsFile; exported: number; skipped: number } {
	const sharedPresets: SharedPreset[] = [];
	let skipped = 0;

	for (const preset of presets) {
		const sharedPreset = toSharedPreset({
			name: preset.name,
			description: preset.description,
			cwd: preset.cwd,
			commands: preset.commands,
			executionMode: preset.executionMode,
		});

		if (!sharedPreset) {
			skipped += 1;
			continue;
		}

		sharedPresets.push(sharedPreset);
	}

	return {
		file: {
			schemaVersion: SHARED_PRESETS_FILE_SCHEMA_VERSION,
			exportedAt,
			app: SHARED_PRESETS_FILE_APP,
			presets: sharedPresets,
		},
		exported: sharedPresets.length,
		skipped,
	};
}

export function parseSharedPresetsFile(content: string): {
	file: SharedPresetsFile;
	skipped: number;
} {
	let parsedJson: unknown;

	try {
		parsedJson = JSON.parse(content);
	} catch {
		throw new Error("Invalid JSON in presets file");
	}

	const parsedFile = sharedPresetsFileSchema.parse(parsedJson);
	const sharedPresets: SharedPreset[] = [];
	let skipped = 0;

	for (const presetEntry of parsedFile.presets) {
		const parsedPreset = rawSharedPresetSchema.safeParse(presetEntry);
		if (!parsedPreset.success) {
			skipped += 1;
			continue;
		}

		const sharedPreset = toSharedPreset(parsedPreset.data);
		if (!sharedPreset) {
			skipped += 1;
			continue;
		}

		sharedPresets.push(sharedPreset);
	}

	return {
		file: {
			schemaVersion: SHARED_PRESETS_FILE_SCHEMA_VERSION,
			exportedAt: parsedFile.exportedAt,
			app: parsedFile.app,
			presets: sharedPresets,
		},
		skipped,
	};
}

export function mergeSharedPresetsIntoTerminalPresets({
	existingPresets,
	sharedPresets,
	initialSkipped = 0,
	createId = () => crypto.randomUUID(),
}: {
	existingPresets: TerminalPreset[];
	sharedPresets: SharedPreset[];
	initialSkipped?: number;
	createId?: () => string;
}): {
	presets: TerminalPreset[];
	created: number;
	updated: number;
	unchanged: number;
	skipped: number;
} {
	const mergedPresets = [...existingPresets];
	const presetIndexByName = new Map<string, number>();

	for (const [index, preset] of mergedPresets.entries()) {
		const key = toNameKey(preset.name);
		if (!presetIndexByName.has(key)) {
			presetIndexByName.set(key, index);
		}
	}

	let created = 0;
	let updated = 0;
	let unchanged = 0;
	let skipped = initialSkipped;

	for (const sharedPreset of sharedPresets) {
		const key = toNameKey(sharedPreset.name);
		if (key.length === 0) {
			skipped += 1;
			continue;
		}

		const existingIndex = presetIndexByName.get(key);

		if (existingIndex === undefined) {
			mergedPresets.push({
				id: createId(),
				name: sharedPreset.name,
				description: sharedPreset.description,
				cwd: sharedPreset.cwd,
				commands: sharedPreset.commands,
				executionMode: normalizePresetExecutionMode(sharedPreset.executionMode),
			});
			presetIndexByName.set(key, mergedPresets.length - 1);
			created += 1;
			continue;
		}

		const existingPreset = mergedPresets[existingIndex];
		if (isPortablePresetEqual(existingPreset, sharedPreset)) {
			unchanged += 1;
			continue;
		}

		mergedPresets[existingIndex] = {
			...existingPreset,
			name: sharedPreset.name,
			description: sharedPreset.description,
			cwd: sharedPreset.cwd,
			commands: sharedPreset.commands,
			executionMode: normalizePresetExecutionMode(sharedPreset.executionMode),
		};
		updated += 1;
	}

	return {
		presets: mergedPresets,
		created,
		updated,
		unchanged,
		skipped,
	};
}

export function previewSharedPresetImport({
	existingPresets,
	sharedPresets,
}: {
	existingPresets: TerminalPreset[];
	sharedPresets: SharedPreset[];
}): {
	items: SharedPresetImportPreviewItem[];
	created: number;
	updated: number;
	unchanged: number;
} {
	const workingPresets = [...existingPresets];
	const presetIndexByName = new Map<string, number>();

	for (const [index, preset] of workingPresets.entries()) {
		const key = toNameKey(preset.name);
		if (!presetIndexByName.has(key)) {
			presetIndexByName.set(key, index);
		}
	}

	const items: SharedPresetImportPreviewItem[] = [];
	let created = 0;
	let updated = 0;
	let unchanged = 0;

	for (const [index, sharedPreset] of sharedPresets.entries()) {
		const key = toNameKey(sharedPreset.name);
		const existingIndex = presetIndexByName.get(key);

		if (existingIndex === undefined) {
			items.push({
				index,
				name: sharedPreset.name,
				description: sharedPreset.description,
				action: "create",
				changedFields: [
					"name",
					"description",
					"cwd",
					"commands",
					"executionMode",
				],
			});

			workingPresets.push({
				id: `preview-${index}`,
				name: sharedPreset.name,
				description: sharedPreset.description,
				cwd: sharedPreset.cwd,
				commands: sharedPreset.commands,
				executionMode: normalizePresetExecutionMode(sharedPreset.executionMode),
			});
			presetIndexByName.set(key, workingPresets.length - 1);
			created += 1;
			continue;
		}

		const existingPreset = workingPresets[existingIndex];
		const changedFields = getPortableFieldChanges(existingPreset, sharedPreset);
		const action: SharedPresetImportAction =
			changedFields.length === 0 ? "unchanged" : "update";

		items.push({
			index,
			name: sharedPreset.name,
			description: sharedPreset.description,
			action,
			changedFields,
			existingPresetId: existingPreset.id,
			existingPresetName: existingPreset.name,
		});

		if (action === "unchanged") {
			unchanged += 1;
			continue;
		}

		workingPresets[existingIndex] = {
			...existingPreset,
			name: sharedPreset.name,
			description: sharedPreset.description,
			cwd: sharedPreset.cwd,
			commands: sharedPreset.commands,
			executionMode: normalizePresetExecutionMode(sharedPreset.executionMode),
		};
		updated += 1;
	}

	return {
		items,
		created,
		updated,
		unchanged,
	};
}
