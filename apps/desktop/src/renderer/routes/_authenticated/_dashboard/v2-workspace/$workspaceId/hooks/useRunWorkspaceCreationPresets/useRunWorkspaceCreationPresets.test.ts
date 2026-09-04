import { describe, expect, it } from "bun:test";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { resolvePendingCreationPresets } from "./useRunWorkspaceCreationPresets";

function preset(id: string, commands: string[]): V2TerminalPresetRow {
	return {
		id,
		name: id,
		cwd: "",
		commands,
		projectIds: null,
		executionMode: "new-tab",
		tabOrder: 0,
		createdAt: new Date(0),
	};
}

describe("resolvePendingCreationPresets", () => {
	it("keeps queue order and drops deleted or empty presets", () => {
		const byId = new Map([
			["a", preset("a", ["bun dev"])],
			["empty", preset("empty", [])],
			["b", preset("b", ["bun test"])],
		]);

		const resolved = resolvePendingCreationPresets(
			["b", "deleted", "empty", "a"],
			(id) => byId.get(id),
			(p) => p.commands,
		);

		expect(resolved.map((p) => p.id)).toEqual(["b", "a"]);
	});
});
