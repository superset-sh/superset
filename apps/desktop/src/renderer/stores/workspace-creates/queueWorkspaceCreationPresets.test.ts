import { describe, expect, it } from "bun:test";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { selectWorkspaceCreationPresetIds } from "./queueWorkspaceCreationPresets";

function preset(
	id: string,
	overrides: Partial<V2TerminalPresetRow> = {},
): V2TerminalPresetRow {
	return {
		id,
		name: id,
		cwd: "",
		commands: ["echo hi"],
		projectIds: null,
		executionMode: "new-tab",
		tabOrder: 0,
		createdAt: new Date(0),
		...overrides,
	};
}

describe("selectWorkspaceCreationPresetIds", () => {
	it("returns only presets tagged for workspace creation, in bar order", () => {
		const presets = [
			preset("second", { applyOnWorkspaceCreated: true, tabOrder: 2 }),
			preset("new-tab-only", { applyOnNewTab: true, tabOrder: 0 }),
			preset("first", { applyOnWorkspaceCreated: true, tabOrder: 1 }),
			preset("untagged", { tabOrder: 3 }),
		];

		expect(selectWorkspaceCreationPresetIds(presets, "project-a")).toEqual([
			"first",
			"second",
		]);
	});

	it("prefers project-targeted presets and ignores other projects'", () => {
		const presets = [
			preset("global", { applyOnWorkspaceCreated: true }),
			preset("mine", {
				projectIds: ["project-a"],
				applyOnWorkspaceCreated: true,
			}),
			preset("theirs", {
				projectIds: ["project-b"],
				applyOnWorkspaceCreated: true,
			}),
		];

		expect(selectWorkspaceCreationPresetIds(presets, "project-a")).toEqual([
			"mine",
		]);
		expect(selectWorkspaceCreationPresetIds(presets, "project-c")).toEqual([
			"global",
		]);
	});
});
