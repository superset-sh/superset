import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TerminalPreset } from "@superset/local-db";
import {
	createTerminalPresetsExport,
	getSharedPresetId,
	loadSharedTerminalPresets,
	mergeSharedAndLocalTerminalPresets,
	parseImportedTerminalPresets,
	toLocalTerminalPresets,
} from "./shared-presets";

const TEST_DIR = join(tmpdir(), `superset-test-shared-presets-${process.pid}`);
const REPO_DIR = join(TEST_DIR, "repo");
const SUPERSET_DIR = join(REPO_DIR, ".superset");
const PRESETS_FILE = join(SUPERSET_DIR, "presets.json");

describe("loadSharedTerminalPresets", () => {
	beforeEach(() => {
		mkdirSync(SUPERSET_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("loads presets from object schema", () => {
		writeFileSync(
			PRESETS_FILE,
			JSON.stringify({
				version: 1,
				presets: [
					{
						slug: "web-dev",
						name: "Web Dev",
						cwd: "apps/web",
						commands: ["bun dev"],
						executionMode: "new-tab",
					},
				],
			}),
		);

		const presets = loadSharedTerminalPresets(REPO_DIR);
		expect(presets).toEqual([
			{
				id: "shared:web-dev",
				name: "Web Dev",
				cwd: "apps/web",
				commands: ["bun dev"],
				executionMode: "new-tab",
			},
		]);
	});

	test("supports array root schema", () => {
		writeFileSync(
			PRESETS_FILE,
			JSON.stringify([
				{
					slug: "api-dev",
					name: "API Dev",
					cwd: "apps/api",
					commands: ["bun dev"],
				},
			]),
		);

		const presets = loadSharedTerminalPresets(REPO_DIR);
		expect(presets[0]?.id).toBe("shared:api-dev");
	});

	test("returns empty array for invalid json", () => {
		writeFileSync(PRESETS_FILE, "{ invalid json }");
		expect(loadSharedTerminalPresets(REPO_DIR)).toEqual([]);
	});
});

describe("mergeSharedAndLocalTerminalPresets", () => {
	test("overrides shared fields with local values when ids match", () => {
		const shared: TerminalPreset[] = [
			{
				id: "shared:web-dev",
				name: "Web Dev",
				cwd: "apps/web",
				commands: ["bun dev"],
				executionMode: "split-pane",
			},
		];
		const local: TerminalPreset[] = [
			{
				id: "shared:web-dev",
				name: "My Web Dev",
				cwd: "apps/web",
				commands: ["bun dev --hot"],
				executionMode: "new-tab",
			},
			{
				id: "local-1",
				name: "My Local",
				cwd: "",
				commands: ["echo hi"],
				executionMode: "split-pane",
			},
		];

		const merged = mergeSharedAndLocalTerminalPresets(shared, local);
		expect(merged).toEqual([
			{
				id: "shared:web-dev",
				name: "My Web Dev",
				cwd: "apps/web",
				commands: ["bun dev --hot"],
				executionMode: "new-tab",
			},
			{
				id: "local-1",
				name: "My Local",
				cwd: "",
				commands: ["echo hi"],
				executionMode: "split-pane",
			},
		]);
	});
});

describe("toLocalTerminalPresets", () => {
	test("keeps only local overrides and local-only presets", () => {
		const shared: TerminalPreset[] = [
			{
				id: getSharedPresetId("web"),
				name: "Web",
				cwd: "",
				commands: ["bun dev"],
				executionMode: "split-pane",
			},
		];
		const effective: TerminalPreset[] = [
			{
				id: getSharedPresetId("web"),
				name: "Web (Personal)",
				cwd: "",
				commands: ["bun dev --hot"],
				executionMode: "new-tab",
			},
			{
				id: "local-1",
				name: "Local Only",
				cwd: "",
				commands: ["echo hi"],
				executionMode: "split-pane",
			},
		];

		const local = toLocalTerminalPresets(effective, shared);
		expect(local).toEqual(effective);
	});

	test("drops unchanged shared presets", () => {
		const shared: TerminalPreset[] = [
			{
				id: getSharedPresetId("web"),
				name: "Web",
				cwd: "",
				commands: ["bun dev"],
				executionMode: "split-pane",
			},
		];

		const local = toLocalTerminalPresets(shared, shared);
		expect(local).toEqual([]);
	});
});

describe("parseImportedTerminalPresets", () => {
	test("parses app export format", () => {
		const presets = parseImportedTerminalPresets({
			schemaVersion: 1,
			exportedAt: new Date().toISOString(),
			app: "superset",
			presets: [
				{
					name: "Imported",
					cwd: "apps/web",
					commands: ["bun dev"],
					executionMode: "new-tab",
				},
			],
		});

		expect(presets).toEqual([
			{
				name: "Imported",
				cwd: "apps/web",
				commands: ["bun dev"],
				executionMode: "new-tab",
			},
		]);
	});

	test("parses shared presets format with slug", () => {
		const presets = parseImportedTerminalPresets({
			version: 1,
			presets: [
				{
					slug: "shared",
					name: "Shared",
					commands: ["bun dev"],
				},
			],
		});

		expect(presets).toEqual([
			{
				name: "Shared",
				cwd: "",
				commands: ["bun dev"],
				executionMode: "split-pane",
			},
		]);
	});

	test("throws for invalid schema", () => {
		expect(() => parseImportedTerminalPresets({})).toThrow();
	});
});

describe("createTerminalPresetsExport", () => {
	test("creates export payload without ids", () => {
		const payload = createTerminalPresetsExport([
			{
				id: "preset-1",
				name: "Preset 1",
				cwd: "",
				commands: ["echo hi"],
				executionMode: "split-pane",
			},
		]);

		expect(payload.schemaVersion).toBe(1);
		expect(payload.app).toBe("superset");
		expect(payload.presets).toEqual([
			{
				name: "Preset 1",
				cwd: "",
				commands: ["echo hi"],
				executionMode: "split-pane",
			},
		]);
	});
});
