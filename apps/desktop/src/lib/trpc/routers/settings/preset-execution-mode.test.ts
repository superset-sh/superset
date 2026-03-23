import { describe, expect, it } from "bun:test";
import {
	normalizeExecutionMode,
	type TerminalPreset,
} from "@superset/local-db/schema/zod";
import {
	normalizeTerminalPresets,
	type PresetWithUnknownMode,
	shouldPersistNormalizedTerminalPresets,
} from "./preset-execution-mode";

function createPreset(mode?: unknown): PresetWithUnknownMode {
	return {
		id: "preset-1",
		name: "preset",
		cwd: "",
		commands: ["echo hi"],
		projectIds: undefined,
		executionMode: mode,
	};
}

describe("normalizeExecutionMode", () => {
	it("keeps new-tab mode", () => {
		expect(normalizeExecutionMode("new-tab")).toBe("new-tab");
	});

	it("keeps new-tab-split-pane mode", () => {
		expect(normalizeExecutionMode("new-tab-split-pane")).toBe(
			"new-tab-split-pane",
		);
	});

	it("maps legacy modes to split-pane and missing modes to new-tab", () => {
		expect(normalizeExecutionMode("split-pane")).toBe("split-pane");
		expect(normalizeExecutionMode("parallel")).toBe("split-pane");
		expect(normalizeExecutionMode("sequential")).toBe("split-pane");
		expect(normalizeExecutionMode(undefined)).toBe("new-tab");
		expect(normalizeExecutionMode("unknown")).toBe("new-tab");
	});
});

describe("normalizeTerminalPresets", () => {
	it("normalizes every preset mode to current enum values", () => {
		const normalized = normalizeTerminalPresets([
			createPreset("new-tab"),
			createPreset("new-tab-split-pane"),
			createPreset("parallel"),
			createPreset(undefined),
		]);

		expect(normalized.map((p) => p.executionMode)).toEqual([
			"new-tab",
			"new-tab-split-pane",
			"split-pane",
			"new-tab",
		] satisfies TerminalPreset["executionMode"][]);
	});

	it("normalizes missing or empty project targeting to null", () => {
		const normalized = normalizeTerminalPresets([
			{
				...createPreset("new-tab"),
				projectIds: undefined,
			},
			{
				...createPreset("new-tab"),
				projectIds: [],
			},
			{
				...createPreset("new-tab"),
				projectIds: ["project-a", "project-a", " project-b "],
			},
		]);

		expect(normalized.map((preset) => preset.projectIds)).toEqual([
			null,
			null,
			["project-a", "project-b"],
		]);
	});

	it("migrates legacy defaults to explicit auto-apply flags and strips isDefault", () => {
		const [normalized] = normalizeTerminalPresets([
			{
				...createPreset("new-tab"),
				isDefault: true,
			},
		]);

		expect(normalized.applyOnWorkspaceCreated).toBe(true);
		expect(normalized.applyOnNewTab).toBe(true);
		expect("isDefault" in normalized).toBe(false);
	});
});

describe("shouldPersistNormalizedTerminalPresets", () => {
	it("returns true when legacy mode, project targeting, or default state exists", () => {
		expect(
			shouldPersistNormalizedTerminalPresets([createPreset("parallel")]),
		).toBe(true);
		expect(
			shouldPersistNormalizedTerminalPresets([createPreset(undefined)]),
		).toBe(true);
		expect(
			shouldPersistNormalizedTerminalPresets([
				{
					...createPreset("new-tab"),
					projectIds: [],
				},
			]),
		).toBe(true);
		expect(
			shouldPersistNormalizedTerminalPresets([
				{
					...createPreset("new-tab"),
					isDefault: true,
				},
			]),
		).toBe(true);
	});

	it("returns false when all modes are normalized", () => {
		expect(
			shouldPersistNormalizedTerminalPresets([
				createPreset("split-pane"),
				createPreset("new-tab"),
				createPreset("new-tab-split-pane"),
			]),
		).toBe(false);
	});
});
