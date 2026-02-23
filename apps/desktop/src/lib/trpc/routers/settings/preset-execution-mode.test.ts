import { describe, expect, it } from "bun:test";
import type { TerminalPreset } from "@superset/local-db";
import {
	normalizePresetExecutionMode,
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

describe("normalizePresetExecutionMode", () => {
	it("keeps new-tab mode", () => {
		expect(normalizePresetExecutionMode("new-tab")).toBe("new-tab");
	});

	it("maps legacy and missing modes to split-pane", () => {
		expect(normalizePresetExecutionMode("split-pane")).toBe("split-pane");
		expect(normalizePresetExecutionMode("parallel")).toBe("split-pane");
		expect(normalizePresetExecutionMode("sequential")).toBe("split-pane");
		expect(normalizePresetExecutionMode(undefined)).toBe("split-pane");
	});
});

describe("normalizeTerminalPresets", () => {
	it("normalizes every preset mode to current enum values", () => {
		const normalized = normalizeTerminalPresets([
			createPreset("new-tab"),
			createPreset("parallel"),
			createPreset(undefined),
		]);

		expect(normalized.map((p) => p.executionMode)).toEqual([
			"new-tab",
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
			]),
		).toBe(false);
	});
});
