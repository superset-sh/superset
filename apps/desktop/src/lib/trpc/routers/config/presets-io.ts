import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TerminalPreset } from "@superset/local-db";
import {
	ensureSupersetHomeDirExists,
	SUPERSET_HOME_DIR,
} from "main/lib/app-environment";
import { PRESETS_FILE_NAME } from "shared/constants";
import { z } from "zod";
import {
	createSharedPresetsFile,
	mergeSharedPresetsIntoTerminalPresets,
	parseSharedPresetsFile,
	previewSharedPresetImport,
} from "./presets-file";

function readAndParsePresetsFile(
	path: string,
): ReturnType<typeof parseSharedPresetsFile> {
	if (!existsSync(path)) {
		throw new Error(`No presets file found at ${path}`);
	}
	try {
		const content = readFileSync(path, "utf-8");
		return parseSharedPresetsFile(content);
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new Error("Invalid presets file format");
		}
		if (error instanceof Error) {
			throw error;
		}
		throw new Error("Failed to parse presets file");
	}
}

function ensureSupersetHomeForPresets(supersetHomeDir: string): void {
	if (supersetHomeDir === SUPERSET_HOME_DIR) {
		ensureSupersetHomeDirExists();
		return;
	}

	if (!existsSync(supersetHomeDir)) {
		mkdirSync(supersetHomeDir, { recursive: true });
	}
}

export function getPresetsFilePath(
	supersetHomeDir = SUPERSET_HOME_DIR,
): string {
	return join(supersetHomeDir, PRESETS_FILE_NAME);
}

export function exportPresetsToFile({
	presets,
	supersetHomeDir = SUPERSET_HOME_DIR,
}: {
	presets: TerminalPreset[];
	supersetHomeDir?: string;
}): { path: string; exported: number; skipped: number } {
	const path = getPresetsFilePath(supersetHomeDir);
	ensureSupersetHomeForPresets(supersetHomeDir);

	const { file, exported, skipped } = createSharedPresetsFile(presets);

	try {
		writeFileSync(path, JSON.stringify(file, null, 2), "utf-8");
	} catch (error) {
		console.error(
			"[config/exportPresetsToFile] Failed to write presets:",
			error,
		);
		throw new Error("Failed to export presets");
	}

	return { path, exported, skipped };
}

export function importPresetsFromFile({
	existingPresets,
	supersetHomeDir = SUPERSET_HOME_DIR,
	selectedIndices,
	importFilePath,
}: {
	existingPresets: TerminalPreset[];
	supersetHomeDir?: string;
	selectedIndices?: number[];
	importFilePath?: string;
}): {
	path: string;
	created: number;
	updated: number;
	unchanged: number;
	skipped: number;
	presets: TerminalPreset[];
} {
	const path = importFilePath ?? getPresetsFilePath(supersetHomeDir);
	const parsed = readAndParsePresetsFile(path);

	const selectedIndexSet = selectedIndices
		? new Set(
				selectedIndices.filter(
					(index) => index >= 0 && index < parsed.file.presets.length,
				),
			)
		: null;
	const sharedPresetsToImport =
		selectedIndexSet === null
			? parsed.file.presets
			: parsed.file.presets.filter((_, index) => selectedIndexSet.has(index));

	const merged = mergeSharedPresetsIntoTerminalPresets({
		existingPresets,
		sharedPresets: sharedPresetsToImport,
		initialSkipped: parsed.skipped,
	});

	return {
		path,
		created: merged.created,
		updated: merged.updated,
		unchanged: merged.unchanged,
		skipped: merged.skipped,
		presets: merged.presets,
	};
}

export function previewImportPresetsFromFile({
	existingPresets,
	supersetHomeDir = SUPERSET_HOME_DIR,
	importFilePath,
}: {
	existingPresets: TerminalPreset[];
	supersetHomeDir?: string;
	importFilePath?: string;
}): {
	path: string;
	created: number;
	updated: number;
	unchanged: number;
	skipped: number;
	items: ReturnType<typeof previewSharedPresetImport>["items"];
} {
	const path = importFilePath ?? getPresetsFilePath(supersetHomeDir);
	const parsed = readAndParsePresetsFile(path);

	const preview = previewSharedPresetImport({
		existingPresets,
		sharedPresets: parsed.file.presets,
	});

	return {
		path,
		created: preview.created,
		updated: preview.updated,
		unchanged: preview.unchanged,
		skipped: parsed.skipped,
		items: preview.items,
	};
}
