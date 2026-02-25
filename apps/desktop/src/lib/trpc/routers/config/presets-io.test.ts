import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TerminalPreset } from "@superset/local-db";
import {
	exportPresetsToFile,
	getPresetsFilePath,
	importPresetsFromFile,
	previewImportPresetsFromFile,
} from "./presets-io";

const TEST_DIR = join(tmpdir(), `superset-presets-io-test-${process.pid}`);

function createSupersetHomeDir(name: string): string {
	const supersetHomeDir = join(TEST_DIR, name);
	mkdirSync(supersetHomeDir, { recursive: true });
	return supersetHomeDir;
}

afterEach(() => {
	if (existsSync(TEST_DIR)) {
		rmSync(TEST_DIR, { recursive: true, force: true });
	}
});

describe("presets-io", () => {
	test("exportPresetsToFile creates presets.json in Superset home", () => {
		const supersetHomeDir = createSupersetHomeDir("export-home");
		const presets: TerminalPreset[] = [
			{
				id: "p1",
				name: "codex",
				cwd: "",
				commands: ["codex"],
				executionMode: "split-pane",
			},
		];

		const result = exportPresetsToFile({ supersetHomeDir, presets });
		const expectedPath = getPresetsFilePath(supersetHomeDir);

		expect(result.path).toBe(expectedPath);
		expect(result.exported).toBe(1);
		expect(result.skipped).toBe(0);
		expect(existsSync(expectedPath)).toBe(true);
	});

	test("importPresetsFromFile returns merge counts", () => {
		const supersetHomeDir = createSupersetHomeDir("import-home");
		const presetsPath = getPresetsFilePath(supersetHomeDir);
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
			existingPresets,
			supersetHomeDir,
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

	test("previewImportPresetsFromFile returns per-preset actions and counts", () => {
		const supersetHomeDir = createSupersetHomeDir("preview-home");
		const presetsPath = getPresetsFilePath(supersetHomeDir);
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
							cwd: "",
							commands: ["codex --new"],
						},
						{
							name: "claude",
							cwd: "",
							commands: ["claude"],
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
				id: "p1",
				name: "Codex",
				cwd: "",
				commands: ["codex --old"],
				executionMode: "split-pane",
			},
			{
				id: "p2",
				name: "untouched",
				cwd: "",
				commands: ["echo untouched"],
				executionMode: "split-pane",
			},
		];

		const result = previewImportPresetsFromFile({
			existingPresets,
			supersetHomeDir,
		});

		expect(result.path).toBe(presetsPath);
		expect(result.created).toBe(1);
		expect(result.updated).toBe(1);
		expect(result.unchanged).toBe(0);
		expect(result.skipped).toBe(0);
		expect(result.items).toHaveLength(2);
		expect(result.items[0]?.action).toBe("update");
		expect(result.items[1]?.action).toBe("create");
	});

	test("importPresetsFromFile applies only selected indices", () => {
		const supersetHomeDir = createSupersetHomeDir("selected-home");
		const presetsPath = getPresetsFilePath(supersetHomeDir);
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
							cwd: "",
							commands: ["codex --new"],
						},
						{
							name: "claude",
							cwd: "",
							commands: ["claude"],
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
				id: "p1",
				name: "Codex",
				cwd: "",
				commands: ["codex --old"],
				executionMode: "split-pane",
			},
		];

		const result = importPresetsFromFile({
			existingPresets,
			supersetHomeDir,
			selectedIndices: [1],
		});

		expect(result.created).toBe(1);
		expect(result.updated).toBe(0);
		expect(result.unchanged).toBe(0);
		expect(result.presets).toHaveLength(2);
		const codex = result.presets.find((preset) => preset.id === "p1");
		expect(codex?.commands).toEqual(["codex --old"]);
	});

	test("previewImportPresetsFromFile reads from explicit file path", () => {
		const supersetHomeDir = createSupersetHomeDir("explicit-path-home");
		const importFilePath = join(TEST_DIR, "custom-import.json");
		writeFileSync(
			importFilePath,
			JSON.stringify(
				{
					schemaVersion: 1,
					exportedAt: "2026-02-25T12:00:00.000Z",
					app: "superset",
					presets: [{ name: "custom", cwd: "", commands: ["echo custom"] }],
				},
				null,
				2,
			),
			"utf-8",
		);

		const result = previewImportPresetsFromFile({
			existingPresets: [],
			supersetHomeDir,
			importFilePath,
		});

		expect(result.path).toBe(importFilePath);
		expect(result.created).toBe(1);
		expect(result.items[0]?.name).toBe("custom");
	});

	test("importPresetsFromFile throws when presets file is missing", () => {
		const supersetHomeDir = join(TEST_DIR, "missing-file-home");
		const existingPresets: TerminalPreset[] = [];

		expect(() =>
			importPresetsFromFile({
				existingPresets,
				supersetHomeDir,
			}),
		).toThrow("No presets file found");
	});
});
