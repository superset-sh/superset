import { describe, expect, it } from "bun:test";
import { collectLineageDescendantIds } from "./collectLineageDescendantIds";

describe("collectLineageDescendantIds", () => {
	it("walks children and grandchildren breadth-first", () => {
		const edges = [
			{ id: "root", parentWorkspaceId: null },
			{ id: "a", parentWorkspaceId: "root" },
			{ id: "b", parentWorkspaceId: "root" },
			{ id: "a1", parentWorkspaceId: "a" },
			{ id: "unrelated", parentWorkspaceId: null },
		];
		expect(collectLineageDescendantIds(edges, "root")).toEqual([
			"a",
			"b",
			"a1",
		]);
	});

	it("returns empty for a leaf", () => {
		expect(
			collectLineageDescendantIds(
				[{ id: "leaf", parentWorkspaceId: null }],
				"leaf",
			),
		).toEqual([]);
	});

	it("terminates on cyclic edges", () => {
		const edges = [
			{ id: "a", parentWorkspaceId: "b" },
			{ id: "b", parentWorkspaceId: "a" },
		];
		expect(collectLineageDescendantIds(edges, "a")).toEqual(["b"]);
	});
});
