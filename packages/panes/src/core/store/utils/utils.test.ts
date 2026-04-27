import { describe, expect, it } from "bun:test";
import type { LayoutNode } from "../../../types";
import {
	equalizeAllSplits,
	findFirstPaneId,
	findPaneInLayout,
	getActiveIdAfterRemoval,
	getNodeAtPath,
	getOtherBranch,
	getPaneIdsInLayout,
	getSpatialNeighborPaneId,
	positionToDirection,
	removePaneFromLayout,
	replacePaneIdInLayout,
	splitPaneInLayout,
	updateAtPath,
} from "./utils";

const SINGLE: LayoutNode = { type: "pane", paneId: "a" };

const TWO_SPLIT: LayoutNode = {
	type: "split",
	direction: "horizontal",
	first: { type: "pane", paneId: "a" },
	second: { type: "pane", paneId: "b" },
};

const NESTED: LayoutNode = {
	type: "split",
	direction: "horizontal",
	first: { type: "pane", paneId: "a" },
	second: {
		type: "split",
		direction: "vertical",
		first: { type: "pane", paneId: "b" },
		second: { type: "pane", paneId: "c" },
	},
};

const DEEP: LayoutNode = {
	type: "split",
	direction: "vertical",
	first: { type: "pane", paneId: "a" },
	second: {
		type: "split",
		direction: "vertical",
		first: { type: "pane", paneId: "b" },
		second: {
			type: "split",
			direction: "vertical",
			first: { type: "pane", paneId: "c" },
			second: { type: "pane", paneId: "d" },
		},
	},
	splitPercentage: 30,
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

describe("getPaneIdsInLayout", () => {
	it("returns pane ids in layout order", () => {
		expect(getPaneIdsInLayout(NESTED)).toEqual(["a", "b", "c"]);
	});
});

describe("getActiveIdAfterRemoval", () => {
	it("preserves inactive focus, otherwise selects next then previous", () => {
		expect(getActiveIdAfterRemoval(["a", "b", "c"], "a", "b")).toBe("a");
		expect(getActiveIdAfterRemoval(["a", "b", "c"], "b", "b")).toBe("c");
		expect(getActiveIdAfterRemoval(["a", "b", "c"], "c", "c")).toBe("b");
		expect(getActiveIdAfterRemoval(["a"], "a", "a")).toBeNull();
	});
});

describe("removePaneFromLayout", () => {
	it("returns null when removing the only pane", () => {
		expect(removePaneFromLayout(SINGLE, "a")).toBeNull();
	});

	it("promotes sibling when removing from a 2-pane split", () => {
		const result = removePaneFromLayout(TWO_SPLIT, "a");
		expect(result).toEqual({ type: "pane", paneId: "b" });
	});

	it("promotes sibling (other direction)", () => {
		const result = removePaneFromLayout(TWO_SPLIT, "b");
		expect(result).toEqual({ type: "pane", paneId: "a" });
	});

	it("collapses nested split — sibling promotion preserves parent", () => {
		// NESTED: { h: [a, { v: [b, c] }] } — remove b → { h: [a, c] }
		const result = removePaneFromLayout(NESTED, "b");
		expect(result).toMatchObject({
			type: "split",
			direction: "horizontal",
			first: { type: "pane", paneId: "a" },
			second: { type: "pane", paneId: "c" },
		});
	});

	it("preserves parent splitPercentage when descendant is removed", () => {
		// DEEP: { v(30%): [a, { v: [b, { v: [c, d] }] }] } — remove c
		const result = removePaneFromLayout(DEEP, "c");
		expect(result).toMatchObject({
			type: "split",
			splitPercentage: 30,
			first: { type: "pane", paneId: "a" },
			second: {
				type: "split",
				first: { type: "pane", paneId: "b" },
				second: { type: "pane", paneId: "d" },
			},
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
			expect(result.second).toEqual({ type: "pane", paneId: "x" });
		}
	});

	it("replaces in nested splits", () => {
		const result = replacePaneIdInLayout(NESTED, "c", "x");
		if (result.type === "split" && result.second.type === "split") {
			expect(result.second.second).toEqual({ type: "pane", paneId: "x" });
		}
	});

	it("returns unchanged layout when pane not found", () => {
		expect(replacePaneIdInLayout(SINGLE, "z", "x")).toEqual(SINGLE);
	});
});

describe("splitPaneInLayout", () => {
	it("wraps a leaf in a new split", () => {
		const result = splitPaneInLayout(SINGLE, "a", "b", "right");
		expect(result).toMatchObject({
			type: "split",
			direction: "horizontal",
			first: { type: "pane", paneId: "a" },
			second: { type: "pane", paneId: "b" },
		});
		// splitPercentage should be absent (defaults to 50)
		if (result.type === "split") {
			expect(result.splitPercentage).toBeUndefined();
		}
	});

	it("left/top puts new pane first", () => {
		const result = splitPaneInLayout(SINGLE, "a", "b", "left");
		if (result.type === "split") {
			expect(result.first).toEqual({ type: "pane", paneId: "b" });
			expect(result.second).toEqual({ type: "pane", paneId: "a" });
		}
	});

	it("top/bottom uses vertical direction", () => {
		const result = splitPaneInLayout(SINGLE, "a", "b", "top");
		if (result.type === "split") {
			expect(result.direction).toBe("vertical");
		}
	});

	it("always creates nested binary split (no flattening)", () => {
		const result = splitPaneInLayout(TWO_SPLIT, "b", "c", "right");
		if (result.type === "split") {
			expect(result.first).toEqual({ type: "pane", paneId: "a" });
			// b is now wrapped in a nested split with c
			expect(result.second.type).toBe("split");
			if (result.second.type === "split") {
				expect(result.second.first).toEqual({ type: "pane", paneId: "b" });
				expect(result.second.second).toEqual({ type: "pane", paneId: "c" });
			}
		}
	});

	it("creates cross-direction nested split", () => {
		const result = splitPaneInLayout(TWO_SPLIT, "b", "c", "bottom");
		if (result.type === "split") {
			expect(result.direction).toBe("horizontal"); // parent unchanged
			const nested = result.second;
			expect(nested.type).toBe("split");
			if (nested.type === "split") {
				expect(nested.direction).toBe("vertical");
				expect(nested.first).toEqual({ type: "pane", paneId: "b" });
				expect(nested.second).toEqual({ type: "pane", paneId: "c" });
			}
		}
	});
});

describe("getNodeAtPath", () => {
	it("returns root for empty path", () => {
		expect(getNodeAtPath(TWO_SPLIT, [])).toEqual(TWO_SPLIT);
	});

	it("returns first child", () => {
		expect(getNodeAtPath(TWO_SPLIT, ["first"])).toEqual({
			type: "pane",
			paneId: "a",
		});
	});

	it("returns nested node", () => {
		expect(getNodeAtPath(NESTED, ["second", "first"])).toEqual({
			type: "pane",
			paneId: "b",
		});
	});

	it("returns null for invalid path", () => {
		expect(getNodeAtPath(SINGLE, ["first"])).toBeNull();
	});
});

describe("updateAtPath", () => {
	it("updates root", () => {
		const result = updateAtPath(TWO_SPLIT, [], (node) =>
			node.type === "split" ? { ...node, splitPercentage: 75 } : node,
		);
		if (result.type === "split") {
			expect(result.splitPercentage).toBe(75);
		}
	});

	it("updates nested node", () => {
		const result = updateAtPath(NESTED, ["second"], (node) =>
			node.type === "split" ? { ...node, splitPercentage: 30 } : node,
		);
		if (result.type === "split" && result.second.type === "split") {
			expect(result.second.splitPercentage).toBe(30);
		}
	});
});

describe("getOtherBranch", () => {
	it("returns second for first", () => {
		expect(getOtherBranch("first")).toBe("second");
	});

	it("returns first for second", () => {
		expect(getOtherBranch("second")).toBe("first");
	});
});

describe("equalizeAllSplits", () => {
	it("returns pane unchanged", () => {
		expect(equalizeAllSplits(SINGLE)).toEqual(SINGLE);
	});

	it("sets splitPercentage to 50 for equal leaves", () => {
		const result = equalizeAllSplits(TWO_SPLIT);
		if (result.type === "split") {
			expect(result.splitPercentage).toBe(50);
		}
	});

	it("sets splitPercentage by leaf count ratio", () => {
		// NESTED: [a, [b, c]] → first has 1 leaf, second has 2 → 33.33%
		const result = equalizeAllSplits(NESTED);
		if (result.type === "split") {
			expect(result.splitPercentage).toBeCloseTo(33.33, 1);
			// Nested split should be 50/50
			if (result.second.type === "split") {
				expect(result.second.splitPercentage).toBe(50);
			}
		}
	});

	it("equalizes deep tree so all panes get equal space", () => {
		// DEEP: [a, [b, [c, d]]] → 4 panes
		// Root: 1/4 = 25%, second: 1/3 = 33.33%, innermost: 1/2 = 50%
		const result = equalizeAllSplits(DEEP);
		if (result.type === "split") {
			expect(result.splitPercentage).toBe(25);
			if (result.second.type === "split") {
				expect(result.second.splitPercentage).toBeCloseTo(33.33, 1);
				if (result.second.second.type === "split") {
					expect(result.second.second.splitPercentage).toBe(50);
				}
			}
		}
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

describe("getSpatialNeighborPaneId", () => {
	//   +---+
	//   | a |
	//   +---+
	it("returns null when there is only one pane", () => {
		const layout: LayoutNode = { type: "pane", paneId: "a" };
		expect(getSpatialNeighborPaneId(layout, "a", "left")).toBeNull();
		expect(getSpatialNeighborPaneId(layout, "a", "right")).toBeNull();
		expect(getSpatialNeighborPaneId(layout, "a", "up")).toBeNull();
		expect(getSpatialNeighborPaneId(layout, "a", "down")).toBeNull();
	});

	//   +---+---+
	//   | a | b |
	//   +---+---+
	it("moves between siblings in a horizontal split", () => {
		const layout: LayoutNode = {
			type: "split",
			direction: "horizontal",
			first: { type: "pane", paneId: "a" },
			second: { type: "pane", paneId: "b" },
		};
		expect(getSpatialNeighborPaneId(layout, "a", "right")).toBe("b");
		expect(getSpatialNeighborPaneId(layout, "b", "left")).toBe("a");
		expect(getSpatialNeighborPaneId(layout, "a", "up")).toBeNull();
		expect(getSpatialNeighborPaneId(layout, "a", "down")).toBeNull();
	});

	//   +---+
	//   | a |
	//   +---+
	//   | b |
	//   +---+
	it("moves between siblings in a vertical split", () => {
		const layout: LayoutNode = {
			type: "split",
			direction: "vertical",
			first: { type: "pane", paneId: "a" },
			second: { type: "pane", paneId: "b" },
		};
		expect(getSpatialNeighborPaneId(layout, "a", "down")).toBe("b");
		expect(getSpatialNeighborPaneId(layout, "b", "up")).toBe("a");
		expect(getSpatialNeighborPaneId(layout, "a", "right")).toBeNull();
	});

	//   +---+---+
	//   | a | b |
	//   +---+---+
	it("does not wrap around at the layout edge", () => {
		const layout: LayoutNode = {
			type: "split",
			direction: "horizontal",
			first: { type: "pane", paneId: "a" },
			second: { type: "pane", paneId: "b" },
		};
		expect(getSpatialNeighborPaneId(layout, "a", "left")).toBeNull();
		expect(getSpatialNeighborPaneId(layout, "b", "right")).toBeNull();
	});

	// 2x2 grid built "rows first":
	//   outer = vertical split { top row / bot row }
	//     top row = horizontal split { a | b }
	//     bot row = horizontal split { c | d }
	//
	//   +---+---+
	//   | a | b |
	//   +---+---+
	//   | c | d |
	//   +---+---+
	it("preserves column alignment in a rows-first 2x2", () => {
		const layout: LayoutNode = {
			type: "split",
			direction: "vertical",
			first: {
				type: "split",
				direction: "horizontal",
				first: { type: "pane", paneId: "a" },
				second: { type: "pane", paneId: "b" },
			},
			second: {
				type: "split",
				direction: "horizontal",
				first: { type: "pane", paneId: "c" },
				second: { type: "pane", paneId: "d" },
			},
		};
		expect(getSpatialNeighborPaneId(layout, "b", "down")).toBe("d");
		expect(getSpatialNeighborPaneId(layout, "d", "up")).toBe("b");
		expect(getSpatialNeighborPaneId(layout, "c", "up")).toBe("a");
		expect(getSpatialNeighborPaneId(layout, "a", "down")).toBe("c");
		expect(getSpatialNeighborPaneId(layout, "a", "right")).toBe("b");
		expect(getSpatialNeighborPaneId(layout, "d", "left")).toBe("c");
		expect(getSpatialNeighborPaneId(layout, "a", "left")).toBeNull();
		expect(getSpatialNeighborPaneId(layout, "b", "up")).toBeNull();
	});

	// 2x2 grid built "columns first":
	//   outer = horizontal split { left col / right col }
	//     left col = vertical split { a / c }
	//     right col = vertical split { b / d }
	//
	//   +---+---+
	//   | a | b |
	//   +---+---+
	//   | c | d |
	//   +---+---+
	it("preserves row alignment in a columns-first 2x2", () => {
		const layout: LayoutNode = {
			type: "split",
			direction: "horizontal",
			first: {
				type: "split",
				direction: "vertical",
				first: { type: "pane", paneId: "a" },
				second: { type: "pane", paneId: "c" },
			},
			second: {
				type: "split",
				direction: "vertical",
				first: { type: "pane", paneId: "b" },
				second: { type: "pane", paneId: "d" },
			},
		};
		expect(getSpatialNeighborPaneId(layout, "c", "right")).toBe("d");
		expect(getSpatialNeighborPaneId(layout, "d", "left")).toBe("c");
		expect(getSpatialNeighborPaneId(layout, "a", "right")).toBe("b");
		expect(getSpatialNeighborPaneId(layout, "b", "left")).toBe("a");
		expect(getSpatialNeighborPaneId(layout, "a", "down")).toBe("c");
		expect(getSpatialNeighborPaneId(layout, "b", "down")).toBe("d");
	});
});
