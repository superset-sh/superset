import { describe, expect, test } from "bun:test";
import {
	computeNextProjectChildTabOrder,
	getProjectChildItems,
	reorderProjectChildItems,
} from "./project-children-order";

describe("getProjectChildItems", () => {
	test("returns mixed top-level items ordered by shared tabOrder", () => {
		const items = getProjectChildItems(
			"p1",
			[
				{ id: "w1", projectId: "p1", sectionId: null, tabOrder: 2 },
				{ id: "w2", projectId: "p1", sectionId: "s1", tabOrder: 0 },
				{ id: "w3", projectId: "p1", sectionId: null, tabOrder: 0 },
			],
			[{ id: "s1", projectId: "p1", tabOrder: 1 }],
		);

		expect(items).toEqual([
			{ id: "w3", kind: "workspace", projectId: "p1", tabOrder: 0 },
			{ id: "s1", kind: "section", projectId: "p1", tabOrder: 1 },
			{ id: "w1", kind: "workspace", projectId: "p1", tabOrder: 2 },
		]);
	});

	test("treats orphaned section workspaces as top-level", () => {
		const items = getProjectChildItems(
			"p1",
			[{ id: "w1", projectId: "p1", sectionId: "missing", tabOrder: 3 }],
			[],
		);

		expect(items).toEqual([
			{ id: "w1", kind: "workspace", projectId: "p1", tabOrder: 3 },
		]);
	});
});

describe("computeNextProjectChildTabOrder", () => {
	test("uses both top-level workspaces and sections", () => {
		const nextTabOrder = computeNextProjectChildTabOrder(
			"p1",
			[
				{ id: "w1", projectId: "p1", sectionId: null, tabOrder: 1 },
				{ id: "w2", projectId: "p1", sectionId: "s1", tabOrder: 8 },
			],
			[{ id: "s1", projectId: "p1", tabOrder: 4 }],
		);

		expect(nextTabOrder).toBe(5);
	});

	test("returns 0 when the project has no top-level children", () => {
		const nextTabOrder = computeNextProjectChildTabOrder("p1", [], []);
		expect(nextTabOrder).toBe(0);
	});
});

describe("reorderProjectChildItems", () => {
	test("reorders sections against workspaces and normalizes tabOrder", () => {
		const reordered = reorderProjectChildItems(
			[
				{ id: "w1", kind: "workspace", projectId: "p1", tabOrder: 2 },
				{ id: "s1", kind: "section", projectId: "p1", tabOrder: 7 },
				{ id: "w2", kind: "workspace", projectId: "p1", tabOrder: 9 },
			],
			1,
			0,
		);

		expect(reordered).toEqual([
			{ id: "s1", kind: "section", projectId: "p1", tabOrder: 0 },
			{ id: "w1", kind: "workspace", projectId: "p1", tabOrder: 1 },
			{ id: "w2", kind: "workspace", projectId: "p1", tabOrder: 2 },
		]);
	});
});
