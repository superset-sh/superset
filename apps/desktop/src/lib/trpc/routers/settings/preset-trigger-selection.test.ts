import { describe, expect, it } from "bun:test";
import type { TerminalPreset } from "@superset/local-db";
import { getPresetsForTriggerField } from "./preset-trigger-selection";

function createPreset(
	id: string,
	overrides: Partial<TerminalPreset> = {},
): TerminalPreset {
	return {
		id,
		name: id,
		cwd: "",
		commands: ["echo hi"],
		projectIds: null,
		executionMode: "new-tab",
		...overrides,
	};
}

describe("getPresetsForTriggerField", () => {
	it("prefers matching project presets over all-project presets", () => {
		const presets = [
			createPreset("all-projects", {
				applyOnWorkspaceCreated: true,
			}),
			createPreset("project-a", {
				projectIds: ["project-a"],
				applyOnWorkspaceCreated: true,
			}),
		];

		expect(
			getPresetsForTriggerField(
				presets,
				"applyOnWorkspaceCreated",
				"project-a",
			).map((preset) => preset.id),
		).toEqual(["project-a"]);
	});

	it("falls back to all-project presets when no project preset matches", () => {
		const presets = [
			createPreset("all-projects", {
				applyOnNewTab: true,
			}),
			createPreset("project-a", {
				projectIds: ["project-a"],
				applyOnNewTab: true,
			}),
		];

		expect(
			getPresetsForTriggerField(presets, "applyOnNewTab", "project-b").map(
				(preset) => preset.id,
			),
		).toEqual(["all-projects"]);
	});

	it("returns no presets when no explicit trigger is set", () => {
		const presets = [
			createPreset("all-projects"),
			createPreset("project-a", {
				projectIds: ["project-a"],
			}),
		];

		expect(
			getPresetsForTriggerField(
				presets,
				"applyOnWorkspaceCreated",
				"project-a",
			),
		).toEqual([]);
	});
});
