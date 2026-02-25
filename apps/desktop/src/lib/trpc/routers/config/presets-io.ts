import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TerminalPreset } from "@superset/local-db";
import { PRESETS_FILE_NAME, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";
import { z } from "zod";
import {
	createSharedPresetsFile,
	mergeSharedPresetsIntoTerminalPresets,
	parseSharedPresetsFile,
} from "./presets-file";

function ensureProjectSupersetDir(mainRepoPath: string): string {
	const supersetDir = join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME);
	if (!existsSync(supersetDir)) {
		mkdirSync(supersetDir, { recursive: true });
	}
	return supersetDir;
}

export function getPresetsFilePath(mainRepoPath: string): string {
	return join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME, PRESETS_FILE_NAME);
}

export function exportPresetsToFile({
	mainRepoPath,
	presets,
}: {
	mainRepoPath: string;
	presets: TerminalPreset[];
}): { path: string; exported: number; skipped: number } {
	const path = getPresetsFilePath(mainRepoPath);
	ensureProjectSupersetDir(mainRepoPath);

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
	mainRepoPath,
	existingPresets,
}: {
	mainRepoPath: string;
	existingPresets: TerminalPreset[];
}): {
	path: string;
	created: number;
	updated: number;
	unchanged: number;
	skipped: number;
	presets: TerminalPreset[];
} {
	const path = getPresetsFilePath(mainRepoPath);
	if (!existsSync(path)) {
		throw new Error(
			`No presets file found at ${PROJECT_SUPERSET_DIR_NAME}/${PRESETS_FILE_NAME}`,
		);
	}

	let parsed: ReturnType<typeof parseSharedPresetsFile>;
	try {
		const content = readFileSync(path, "utf-8");
		parsed = parseSharedPresetsFile(content);
	} catch (error) {
		console.error(
			"[config/importPresetsFromFile] Failed to parse presets:",
			error,
		);
		if (error instanceof z.ZodError) {
			throw new Error("Invalid presets file format");
		}
		if (error instanceof Error) {
			throw new Error(error.message);
		}
		throw new Error("Failed to import presets");
	}

	const merged = mergeSharedPresetsIntoTerminalPresets({
		existingPresets,
		sharedPresets: parsed.file.presets,
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
