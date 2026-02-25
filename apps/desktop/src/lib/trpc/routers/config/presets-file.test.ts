import { describe, expect, test } from "bun:test";
import type { TerminalPreset } from "@superset/local-db";
import {
	createSharedPresetsFile,
	mergeSharedPresetsIntoTerminalPresets,
	parseSharedPresetsFile,
	SHARED_PRESETS_FILE_SCHEMA_VERSION,
} from "./presets-file";

describe("presets-file", () => {
	test("export includes only portable fields and skips unnamed presets", () => {
		const presets: TerminalPreset[] = [
			{
				id: "preset-1",
				name: " codex ",
				description: "  Shared codex preset  ",
				cwd: "apps/desktop",
				commands: ["codex --full-auto"],
				pinnedToBar: false,
				isDefault: true,
				applyOnWorkspaceCreated: true,
				applyOnNewTab: true,
				executionMode: "new-tab",
			},
			{
				id: "preset-2",
				name: "   ",
				cwd: "",
				commands: ["echo skipped"],
				executionMode: "split-pane",
			},
		];

		const result = createSharedPresetsFile(presets, "2026-02-25T12:00:00.000Z");

		expect(result.exported).toBe(1);
		expect(result.skipped).toBe(1);
		expect(result.file.schemaVersion).toBe(SHARED_PRESETS_FILE_SCHEMA_VERSION);
		expect(result.file.app).toBe("superset");
		expect(result.file.presets).toEqual([
			{
				name: "codex",
				description: "Shared codex preset",
				cwd: "apps/desktop",
				commands: ["codex --full-auto"],
				executionMode: "new-tab",
			},
		]);

		const serializedPreset = result.file.presets[0];
		expect(serializedPreset).not.toHaveProperty("id");
		expect(serializedPreset).not.toHaveProperty("pinnedToBar");
		expect(serializedPreset).not.toHaveProperty("isDefault");
		expect(serializedPreset).not.toHaveProperty("applyOnWorkspaceCreated");
		expect(serializedPreset).not.toHaveProperty("applyOnNewTab");
	});

	test("merge updates existing preset by name while preserving local-only fields", () => {
		const existingPresets: TerminalPreset[] = [
			{
				id: "existing-id",
				name: "Codex",
				description: "old description",
				cwd: "",
				commands: ["codex old"],
				pinnedToBar: false,
				isDefault: true,
				applyOnWorkspaceCreated: true,
				applyOnNewTab: true,
				executionMode: "split-pane",
			},
		];

		const result = mergeSharedPresetsIntoTerminalPresets({
			existingPresets,
			sharedPresets: [
				{
					name: "codex",
					description: "new description",
					cwd: "apps/api",
					commands: ["codex --dangerously-skip-permissions"],
					executionMode: "new-tab",
				},
			],
		});

		expect(result.created).toBe(0);
		expect(result.updated).toBe(1);
		expect(result.unchanged).toBe(0);
		expect(result.skipped).toBe(0);

		expect(result.presets).toHaveLength(1);
		expect(result.presets[0]).toEqual({
			id: "existing-id",
			name: "codex",
			description: "new description",
			cwd: "apps/api",
			commands: ["codex --dangerously-skip-permissions"],
			pinnedToBar: false,
			isDefault: true,
			applyOnWorkspaceCreated: true,
			applyOnNewTab: true,
			executionMode: "new-tab",
		});
	});

	test("merge adds new presets when no matching name exists", () => {
		const result = mergeSharedPresetsIntoTerminalPresets({
			existingPresets: [],
			sharedPresets: [
				{
					name: "claude",
					description: "Claude preset",
					cwd: "",
					commands: ["claude --dangerously-skip-permissions"],
					executionMode: "split-pane",
				},
			],
			createId: () => "new-id",
		});

		expect(result.created).toBe(1);
		expect(result.updated).toBe(0);
		expect(result.unchanged).toBe(0);
		expect(result.skipped).toBe(0);
		expect(result.presets).toEqual([
			{
				id: "new-id",
				name: "claude",
				description: "Claude preset",
				cwd: "",
				commands: ["claude --dangerously-skip-permissions"],
				executionMode: "split-pane",
			},
		]);
	});

	test("parse reports invalid JSON", () => {
		expect(() => parseSharedPresetsFile("{ invalid json")).toThrow(
			"Invalid JSON in presets file",
		);
	});

	test("parse skips invalid presets and normalizes unknown execution mode", () => {
		const file = {
			schemaVersion: 1,
			exportedAt: "2026-02-25T12:00:00.000Z",
			app: "superset",
			presets: [
				{
					name: "codex",
					description: "Codex preset",
					cwd: "",
					commands: ["codex"],
					executionMode: "parallel",
				},
				{
					name: "",
					cwd: "",
					commands: ["invalid due to blank name"],
				},
				{
					name: "invalid-commands",
					cwd: "",
					commands: "not-an-array",
				},
			],
		};

		const result = parseSharedPresetsFile(JSON.stringify(file));

		expect(result.skipped).toBe(2);
		expect(result.file.presets).toEqual([
			{
				name: "codex",
				description: "Codex preset",
				cwd: "",
				commands: ["codex"],
				executionMode: "split-pane",
			},
		]);
	});
});
