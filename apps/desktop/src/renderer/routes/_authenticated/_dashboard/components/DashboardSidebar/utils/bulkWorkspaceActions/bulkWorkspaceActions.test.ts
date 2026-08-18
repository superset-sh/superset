import { describe, expect, it } from "bun:test";
import { workspaceIdsForSectionMove } from "./bulkWorkspaceActions";

describe("workspaceIdsForSectionMove", () => {
	const sectionByWorkspaceId = new Map([
		["one", "section-a"],
		["two", "section-b"],
	]);

	it("skips workspaces already in the destination group", () => {
		expect(
			workspaceIdsForSectionMove(
				["one", "two", "three"],
				sectionByWorkspaceId,
				"section-a",
			),
		).toEqual(["two", "three"]);
	});

	it("only returns grouped workspaces when ungrouping", () => {
		expect(
			workspaceIdsForSectionMove(
				["one", "two", "three"],
				sectionByWorkspaceId,
				null,
			),
		).toEqual(["one", "two"]);
	});
});
