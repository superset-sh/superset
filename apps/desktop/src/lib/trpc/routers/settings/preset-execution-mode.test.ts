import { describe, expect, it } from "bun:test";
import {
	normalizeExecutionMode,
	type TerminalPreset,
} from "@superset/local-db";
import {
	normalizeTerminalPresets,
	type PresetWithUnknownMode,
	shouldPersistNormalizedPresetModes,
} from "./preset-execution-mode";

function createPreset(mode?: unknown): PresetWithUnknownMode {
	return {
		id: "preset-1",
		name: "preset",
		cwd: "",
		commands: ["echo hi"],
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

	it("maps legacy and missing modes to split-pane", () => {
		expect(normalizeExecutionMode("split-pane")).toBe("split-pane");
		expect(normalizeExecutionMode("parallel")).toBe("split-pane");
		expect(normalizeExecutionMode("sequential")).toBe("split-pane");
		expect(normalizeExecutionMode(undefined)).toBe("split-pane");
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
			"split-pane",
		] satisfies TerminalPreset["executionMode"][]);
	});
});

describe("shouldPersistNormalizedPresetModes", () => {
	it("returns true when legacy or missing mode exists", () => {
		expect(shouldPersistNormalizedPresetModes([createPreset("parallel")])).toBe(
			true,
		);
		expect(shouldPersistNormalizedPresetModes([createPreset(undefined)])).toBe(
			true,
		);
	});

	it("returns false when all modes are normalized", () => {
		expect(
			shouldPersistNormalizedPresetModes([
				createPreset("split-pane"),
				createPreset("new-tab"),
				createPreset("new-tab-split-pane"),
			]),
		).toBe(false);
	});
});
