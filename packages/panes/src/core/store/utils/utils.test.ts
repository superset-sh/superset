import { describe, expect, it } from "bun:test";
import type { LayoutNode } from "../../../types";
import {
	findFirstPaneId,
	findPaneInLayout,
	positionToDirection,
	removePaneFromLayout,
	replacePaneIdInLayout,
	splitPaneInLayout,
	updateSplitInLayout,
} from "./utils";

const SINGLE: LayoutNode = { type: "pane", paneId: "a" };

const TWO_SPLIT: LayoutNode = {
	type: "split",
	id: "s1",
	direction: "horizontal",
	children: [
		{ type: "pane", paneId: "a" },
		{ type: "pane", paneId: "b" },
	],
	weights: [1, 1],
};

const THREE_SPLIT: LayoutNode = {
	type: "split",
	id: "s1",
	direction: "horizontal",
	children: [
		{ type: "pane", paneId: "a" },
		{ type: "pane", paneId: "b" },
		{ type: "pane", paneId: "c" },
	],
	weights: [3, 2, 1],
};

const NESTED: LayoutNode = {
	type: "split",
	id: "s1",
	direction: "horizontal",
	children: [
		{ type: "pane", paneId: "a" },
		{
			type: "split",
			id: "s2",
			direction: "vertical",
			children: [
				{ type: "pane", paneId: "b" },
				{ type: "pane", paneId: "c" },
			],
			weights: [1, 1],
		},
	],
	weights: [1, 1],
};

describe("findPaneInLayout", () => {
	it("finds a pane in a single leaf", () => {
		expect(findPaneInLayout(SINGLE, "a")).toBe(true);
		expect(findPaneInLayout(SINGLE, "z")).toBe(false);
	});

	it("finds panes in a split", () => {
		expect(findPaneInLayout(TWO_SPLIT, "a")).toBe(true);
		expect(findPaneInLayout(TWO_SPLIT, "b")).toBe(true);
		expect(findPaneInLayout(TWO_SPLIT, "z")).toBe(false);
	});

	it("finds panes in nested splits", () => {
		expect(findPaneInLayout(NESTED, "c")).toBe(true);
		expect(findPaneInLayout(NESTED, "z")).toBe(false);
	});
});

describe("findFirstPaneId", () => {
	it("returns the pane id for a leaf", () => {
		expect(findFirstPaneId(SINGLE)).toBe("a");
	});

	it("returns the first (depth-first) pane in a split", () => {
		expect(findFirstPaneId(TWO_SPLIT)).toBe("a");
	});

	it("returns the first pane in nested splits", () => {
		expect(findFirstPaneId(NESTED)).toBe("a");
	});
});

describe("removePaneFromLayout", () => {
	it("returns null when removing the only pane", () => {
		expect(removePaneFromLayout(SINGLE, "a")).toBeNull();
	});

	it("returns the remaining pane when removing from a 2-pane split", () => {
		const result = removePaneFromLayout(TWO_SPLIT, "a");
		expect(result).toEqual({ type: "pane", paneId: "b" });
	});

	it("preserves weights when removing from a 3-pane split", () => {
		const result = removePaneFromLayout(THREE_SPLIT, "b");
		expect(result).toMatchObject({
			type: "split",
			weights: [3, 1],
			children: [
				{ type: "pane", paneId: "a" },
				{ type: "pane", paneId: "c" },
			],
		});
	});

	it("collapses nested split when child is removed", () => {
		const result = removePaneFromLayout(NESTED, "b");
		// s2 had [b, c], removing b leaves just c — s2 collapses
		// s1 now has [a, c]
		expect(result).toMatchObject({
			type: "split",
			id: "s1",
			children: [
				{ type: "pane", paneId: "a" },
				{ type: "pane", paneId: "c" },
			],
		});
	});

	it("returns unchanged layout when pane not found", () => {
		expect(removePaneFromLayout(TWO_SPLIT, "z")).toEqual(TWO_SPLIT);
	});
});

describe("replacePaneIdInLayout", () => {
	it("replaces a pane id in a leaf", () => {
		expect(replacePaneIdInLayout(SINGLE, "a", "x")).toEqual({
			type: "pane",
			paneId: "x",
		});
	});

	it("replaces a pane id inside a split", () => {
		const result = replacePaneIdInLayout(TWO_SPLIT, "b", "x");
		if (result.type === "split") {
			expect(result.children[1]).toEqual({ type: "pane", paneId: "x" });
		}
	});

	it("replaces in nested splits", () => {
		const result = replacePaneIdInLayout(NESTED, "c", "x");
		if (result.type === "split" && result.children[1]?.type === "split") {
			expect(result.children[1].children[1]).toEqual({
				type: "pane",
				paneId: "x",
			});
		}
	});

	it("returns unchanged layout when pane not found", () => {
		expect(replacePaneIdInLayout(SINGLE, "z", "x")).toEqual(SINGLE);
	});
});

describe("splitPaneInLayout", () => {
	it("wraps a leaf in a new split", () => {
		const result = splitPaneInLayout(SINGLE, "a", "b", "right");
		expect(result.type).toBe("split");
		if (result.type === "split") {
			expect(result.direction).toBe("horizontal");
			expect(result.weights).toEqual([1, 1]);
			expect(result.children[0]).toEqual({ type: "pane", paneId: "a" });
			expect(result.children[1]).toEqual({ type: "pane", paneId: "b" });
		}
	});

	it("left/top puts new pane first", () => {
		const result = splitPaneInLayout(SINGLE, "a", "b", "left");
		if (result.type === "split") {
			expect(result.children[0]).toEqual({ type: "pane", paneId: "b" });
			expect(result.children[1]).toEqual({ type: "pane", paneId: "a" });
		}
	});

	it("top/bottom uses vertical direction", () => {
		const result = splitPaneInLayout(SINGLE, "a", "b", "top");
		if (result.type === "split") {
			expect(result.direction).toBe("vertical");
		}
	});

	it("inserts into existing same-direction split and halves weight", () => {
		const result = splitPaneInLayout(THREE_SPLIT, "b", "d", "right");
		if (result.type === "split") {
			expect(result.children).toHaveLength(4);
			expect(result.weights).toEqual([3, 1, 1, 1]);
			expect(result.children[1]).toEqual({ type: "pane", paneId: "b" });
			expect(result.children[2]).toEqual({ type: "pane", paneId: "d" });
		}
	});

	it("inserts left into existing same-direction split", () => {
		const result = splitPaneInLayout(THREE_SPLIT, "b", "d", "left");
		if (result.type === "split") {
			expect(result.children).toHaveLength(4);
			expect(result.children[1]).toEqual({ type: "pane", paneId: "d" });
			expect(result.children[2]).toEqual({ type: "pane", paneId: "b" });
		}
	});

	it("creates nested split for cross-direction split", () => {
		const result = splitPaneInLayout(TWO_SPLIT, "b", "c", "bottom");
		if (result.type === "split") {
			expect(result.children).toHaveLength(2);
			expect(result.children[0]).toEqual({ type: "pane", paneId: "a" });
			const nested = result.children[1];
			expect(nested?.type).toBe("split");
			if (nested?.type === "split") {
				expect(nested.direction).toBe("vertical");
				expect(nested.children[0]).toEqual({ type: "pane", paneId: "b" });
				expect(nested.children[1]).toEqual({ type: "pane", paneId: "c" });
			}
		}
	});

	it("uses custom weights", () => {
		const result = splitPaneInLayout(SINGLE, "a", "b", "right", [3, 1]);
		if (result.type === "split") {
			expect(result.weights).toEqual([3, 1]);
		}
	});
});

describe("updateSplitInLayout", () => {
	it("updates a split by id", () => {
		const result = updateSplitInLayout(TWO_SPLIT, "s1", (split) => ({
			...split,
			weights: [3, 7],
		}));
		if (result.type === "split") {
			expect(result.weights).toEqual([3, 7]);
		}
	});

	it("updates a nested split", () => {
		const result = updateSplitInLayout(NESTED, "s2", (split) => ({
			...split,
			weights: [3, 1],
		}));
		if (result.type === "split" && result.children[1]?.type === "split") {
			expect(result.children[1].weights).toEqual([3, 1]);
		}
	});

	it("returns unchanged layout for missing id", () => {
		expect(updateSplitInLayout(TWO_SPLIT, "missing", (s) => s)).toEqual(
			TWO_SPLIT,
		);
	});
});

describe("positionToDirection", () => {
	it("maps left/right to horizontal", () => {
		expect(positionToDirection("left")).toBe("horizontal");
		expect(positionToDirection("right")).toBe("horizontal");
	});

	it("maps top/bottom to vertical", () => {
		expect(positionToDirection("top")).toBe("vertical");
		expect(positionToDirection("bottom")).toBe("vertical");
	});
});
