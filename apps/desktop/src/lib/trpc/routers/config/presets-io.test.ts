import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TerminalPreset } from "@superset/local-db";
import { PROJECT_SUPERSET_DIR_NAME } from "shared/constants";
import {
	exportPresetsToFile,
	getPresetsFilePath,
	importPresetsFromFile,
} from "./presets-io";

const TEST_DIR = join(tmpdir(), `superset-presets-io-test-${process.pid}`);

function createRepoPath(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	return repoPath;
}

afterEach(() => {
	if (existsSync(TEST_DIR)) {
		rmSync(TEST_DIR, { recursive: true, force: true });
	}
});

describe("presets-io", () => {
	test("exportPresetsToFile creates .superset directory and writes presets.json", () => {
		const repoPath = createRepoPath("export-repo");
		const presets: TerminalPreset[] = [
			{
				id: "p1",
				name: "codex",
				cwd: "",
				commands: ["codex"],
				executionMode: "split-pane",
			},
		];

		const result = exportPresetsToFile({ mainRepoPath: repoPath, presets });
		const expectedPath = getPresetsFilePath(repoPath);

		expect(result.path).toBe(expectedPath);
		expect(result.exported).toBe(1);
		expect(result.skipped).toBe(0);
		expect(existsSync(expectedPath)).toBe(true);
	});

	test("importPresetsFromFile returns merge counts", () => {
		const repoPath = createRepoPath("import-repo");
		const supersetDir = join(repoPath, PROJECT_SUPERSET_DIR_NAME);
		mkdirSync(supersetDir, { recursive: true });

		const presetsPath = getPresetsFilePath(repoPath);
		writeFileSync(
			presetsPath,
			JSON.stringify(
				{
					schemaVersion: 1,
					exportedAt: "2026-02-25T12:00:00.000Z",
					app: "superset",
					presets: [
						{
							name: "codex",
							cwd: "apps/api",
							commands: ["codex --full-auto"],
							executionMode: "new-tab",
						},
						{
							name: "claude",
							cwd: "",
							commands: ["claude"],
						},
						{
							name: "",
							cwd: "",
							commands: ["invalid"],
						},
					],
				},
				null,
				2,
			),
			"utf-8",
		);

		const existingPresets: TerminalPreset[] = [
			{
				id: "existing-codex",
				name: "Codex",
				cwd: "",
				commands: ["codex old"],
				pinnedToBar: false,
				executionMode: "split-pane",
			},
			{
				id: "untouched",
				name: "opencode",
				cwd: "",
				commands: ["opencode"],
				executionMode: "split-pane",
			},
		];

		const result = importPresetsFromFile({
			mainRepoPath: repoPath,
			existingPresets,
		});

		expect(result.path).toBe(presetsPath);
		expect(result.created).toBe(1);
		expect(result.updated).toBe(1);
		expect(result.unchanged).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.presets).toHaveLength(3);

		const updatedCodex = result.presets.find(
			(preset) => preset.id === "existing-codex",
		);
		expect(updatedCodex?.commands).toEqual(["codex --full-auto"]);
		expect(updatedCodex?.pinnedToBar).toBe(false);
		expect(updatedCodex?.executionMode).toBe("new-tab");
	});

	test("importPresetsFromFile throws when presets file is missing", () => {
		const repoPath = createRepoPath("missing-file-repo");
		const existingPresets: TerminalPreset[] = [];

		expect(() =>
			importPresetsFromFile({
				mainRepoPath: repoPath,
				existingPresets,
			}),
		).toThrow("No presets file found");
	});
});
