import { describe, expect, it } from "bun:test";
import {
	filterMatchingPresetsForProject,
	isProjectTargetedPreset,
	normalizePresetProjectIds,
	presetMatchesProjectId,
} from "./preset-project-targeting";

describe("normalizePresetProjectIds", () => {
	it("normalizes missing or empty values to null", () => {
		expect(normalizePresetProjectIds(undefined)).toBeNull();
		expect(normalizePresetProjectIds(null)).toBeNull();
		expect(normalizePresetProjectIds([])).toBeNull();
		expect(normalizePresetProjectIds(["", "   "])).toBeNull();
	});

	it("trims, deduplicates, and preserves order", () => {
		expect(
			normalizePresetProjectIds([" project-a ", "project-b", "project-a"]),
		).toEqual(["project-a", "project-b"]);
	});
});

describe("presetMatchesProjectId", () => {
	it("matches global presets for any project", () => {
		expect(presetMatchesProjectId({ projectIds: null }, "project-a")).toBe(
			true,
		);
		expect(presetMatchesProjectId({ projectIds: undefined }, "project-a")).toBe(
			true,
		);
	});

	it("matches only listed projects for targeted presets", () => {
		expect(
			presetMatchesProjectId({ projectIds: ["project-a"] }, "project-a"),
		).toBe(true);
		expect(
			presetMatchesProjectId({ projectIds: ["project-a"] }, "project-b"),
		).toBe(false);
	});
});

describe("isProjectTargetedPreset", () => {
	it("returns true only when project ids are present", () => {
		expect(isProjectTargetedPreset({ projectIds: ["project-a"] })).toBe(true);
		expect(isProjectTargetedPreset({ projectIds: null })).toBe(false);
	});
});

describe("filterMatchingPresetsForProject", () => {
	it("returns targeted matches before global matches", () => {
		const presets = [
			{ id: "global-1", projectIds: null },
			{ id: "targeted-1", projectIds: ["project-a"] },
			{ id: "global-2", projectIds: null },
			{ id: "targeted-2", projectIds: ["project-a", "project-b"] },
		];

		expect(
			filterMatchingPresetsForProject(presets, "project-a").map(
				(preset) => preset.id,
			),
		).toEqual(["targeted-1", "targeted-2", "global-1", "global-2"]);
	});

	it("filters out non-matching targeted presets", () => {
		const presets = [
			{ id: "global", projectIds: null },
			{ id: "targeted", projectIds: ["project-a"] },
		];

		expect(
			filterMatchingPresetsForProject(presets, "project-b").map(
				(preset) => preset.id,
			),
		).toEqual(["global"]);
	});
});
