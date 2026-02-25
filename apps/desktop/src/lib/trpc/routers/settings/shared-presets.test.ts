import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TerminalPreset } from "@superset/local-db";
import {
	getSharedPresetId,
	loadSharedTerminalPresets,
	mergeSharedAndLocalTerminalPresets,
	toLocalTerminalPresets,
} from "./shared-presets";

const TEST_DIR = join(tmpdir(), `superset-test-shared-presets-${process.pid}`);
const WORKTREE_DIR = join(TEST_DIR, "worktree");
const SUPERSET_DIR = join(WORKTREE_DIR, ".superset");
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

		const presets = loadSharedTerminalPresets(WORKTREE_DIR, "workspace-1");
		expect(presets).toEqual([
			{
				id: "shared:workspace-1:web-dev",
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

		const presets = loadSharedTerminalPresets(WORKTREE_DIR, "workspace-1");
		expect(presets[0]?.id).toBe("shared:workspace-1:api-dev");
	});

	test("returns empty array for invalid json", () => {
		writeFileSync(PRESETS_FILE, "{ invalid json }");
		expect(loadSharedTerminalPresets(WORKTREE_DIR, "workspace-1")).toEqual([]);
	});
});

describe("mergeSharedAndLocalTerminalPresets", () => {
	test("overrides shared fields with local values when ids match", () => {
		const shared: TerminalPreset[] = [
			{
				id: getSharedPresetId("workspace-1", "web-dev"),
				name: "Web Dev",
				cwd: "apps/web",
				commands: ["bun dev"],
				executionMode: "split-pane",
			},
		];
		const local: TerminalPreset[] = [
			{
				id: getSharedPresetId("workspace-1", "web-dev"),
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
				id: getSharedPresetId("workspace-1", "web-dev"),
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

	test("ignores shared overrides from other workspaces", () => {
		const shared: TerminalPreset[] = [
			{
				id: getSharedPresetId("workspace-1", "web-dev"),
				name: "Web Dev",
				cwd: "",
				commands: ["bun dev"],
				executionMode: "split-pane",
			},
		];
		const local: TerminalPreset[] = [
			{
				id: getSharedPresetId("workspace-2", "web-dev"),
				name: "Workspace 2 Override",
				cwd: "",
				commands: ["bun dev --hot"],
				executionMode: "split-pane",
			},
		];

		const merged = mergeSharedAndLocalTerminalPresets(shared, local);
		expect(merged).toEqual(shared);
	});
});

describe("toLocalTerminalPresets", () => {
	test("keeps only local overrides and local-only presets", () => {
		const shared: TerminalPreset[] = [
			{
				id: getSharedPresetId("workspace-1", "web"),
				name: "Web",
				cwd: "",
				commands: ["bun dev"],
				executionMode: "split-pane",
			},
		];
		const effective: TerminalPreset[] = [
			{
				id: getSharedPresetId("workspace-1", "web"),
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
				id: getSharedPresetId("workspace-1", "web"),
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
