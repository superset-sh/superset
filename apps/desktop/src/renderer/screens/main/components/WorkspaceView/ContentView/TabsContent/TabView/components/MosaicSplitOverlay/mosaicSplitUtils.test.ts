import { describe, expect, test } from "bun:test";
import {
	KEYBOARD_STEP,
	MIN_PERCENTAGE,
	collectSplits,
	equalizeSplitPercentages,
	getAbsoluteSplitPercentage,
	getRelativeSplitPercentage,
	splitBox,
	updateSplitPercentage,
} from "./mosaicSplitUtils";

const emptyBox = { top: 0, right: 0, bottom: 0, left: 0 };

describe("getAbsoluteSplitPercentage", () => {
	test("row: maps relative pct to absolute in full box", () => {
		expect(getAbsoluteSplitPercentage(emptyBox, 50, "row")).toBe(50);
	});

	test("row: accounts for left/right offsets", () => {
		const box = { top: 0, bottom: 0, left: 20, right: 20 };
		// width=60, 50% of 60 = 30, + left 20 = 50
		expect(getAbsoluteSplitPercentage(box, 50, "row")).toBe(50);
	});

	test("row: 0% maps to left edge", () => {
		const box = { top: 0, bottom: 0, left: 20, right: 20 };
		expect(getAbsoluteSplitPercentage(box, 0, "row")).toBe(20);
	});

	test("column: maps relative pct to absolute in full box", () => {
		expect(getAbsoluteSplitPercentage(emptyBox, 25, "column")).toBe(25);
	});

	test("column: accounts for top/bottom offsets", () => {
		const box = { top: 10, bottom: 10, left: 0, right: 0 };
		// height=80, 50% of 80 = 40, + top 10 = 50
		expect(getAbsoluteSplitPercentage(box, 50, "column")).toBe(50);
	});
});

describe("getRelativeSplitPercentage", () => {
	test("row: round-trips with getAbsoluteSplitPercentage", () => {
		const box = { top: 0, bottom: 0, left: 10, right: 10 };
		const relative = 60;
		const abs = getAbsoluteSplitPercentage(box, relative, "row");
		expect(getRelativeSplitPercentage(box, abs, "row")).toBeCloseTo(relative);
	});

	test("column: round-trips with getAbsoluteSplitPercentage", () => {
		const box = { top: 5, bottom: 15, left: 0, right: 0 };
		const relative = 30;
		const abs = getAbsoluteSplitPercentage(box, relative, "column");
		expect(getRelativeSplitPercentage(box, abs, "column")).toBeCloseTo(relative);
	});
});

describe("splitBox", () => {
	test("row 50%: splits box into equal left/right halves", () => {
		const { first, second } = splitBox(emptyBox, 50, "row");
		expect(first.right).toBeCloseTo(50);
		expect(second.left).toBeCloseTo(50);
		expect(first.top).toBe(0);
		expect(first.bottom).toBe(0);
	});

	test("column 50%: splits box into equal top/bottom halves", () => {
		const { first, second } = splitBox(emptyBox, 50, "column");
		expect(first.bottom).toBeCloseTo(50);
		expect(second.top).toBeCloseTo(50);
		expect(first.left).toBe(0);
		expect(first.right).toBe(0);
	});

	test("row: preserves top/bottom on both halves", () => {
		const box = { top: 5, bottom: 5, left: 0, right: 0 };
		const { first, second } = splitBox(box, 50, "row");
		expect(first.top).toBe(5);
		expect(second.top).toBe(5);
	});

	test("column: preserves left/right on both halves", () => {
		const box = { top: 0, bottom: 0, left: 15, right: 15 };
		const { first, second } = splitBox(box, 50, "column");
		expect(first.left).toBe(15);
		expect(second.right).toBe(15);
	});
});

describe("collectSplits", () => {
	test("leaf node produces no splits", () => {
		const out: ReturnType<typeof collectSplits> extends void
			? never
			: unknown[] = [];
		const splits: Parameters<typeof collectSplits>[3] = [];
		collectSplits("pane-a", emptyBox, [], splits);
		expect(splits).toHaveLength(0);
	});

	test("single split node produces one entry", () => {
		const splits: Parameters<typeof collectSplits>[3] = [];
		collectSplits(
			{ direction: "row", first: "a", second: "b", splitPercentage: 40 },
			emptyBox,
			[],
			splits,
		);
		expect(splits).toHaveLength(1);
		expect(splits[0].direction).toBe("row");
		expect(splits[0].splitPercentage).toBe(40);
		expect(splits[0].path).toEqual([]);
	});

	test("defaults splitPercentage to 50 when undefined", () => {
		const splits: Parameters<typeof collectSplits>[3] = [];
		collectSplits(
			{ direction: "column", first: "a", second: "b" },
			emptyBox,
			[],
			splits,
		);
		expect(splits[0].splitPercentage).toBe(50);
	});

	test("nested tree produces splits for each branch node", () => {
		const splits: Parameters<typeof collectSplits>[3] = [];
		collectSplits(
			{
				direction: "row",
				first: { direction: "column", first: "a", second: "b" },
				second: "c",
			},
			emptyBox,
			[],
			splits,
		);
		expect(splits).toHaveLength(2);
		expect(splits[1].path).toEqual(["first"]);
		expect(splits[1].direction).toBe("column");
	});
});

describe("updateSplitPercentage", () => {
	test("updates root node percentage", () => {
		const node = { direction: "row" as const, first: "a", second: "b", splitPercentage: 50 };
		const updated = updateSplitPercentage(node, [], 70);
		expect(typeof updated !== "string" && updated.splitPercentage).toBe(70);
	});

	test("updates nested node at path", () => {
		const node = {
			direction: "row" as const,
			first: { direction: "column" as const, first: "a", second: "b", splitPercentage: 30 },
			second: "c",
			splitPercentage: 50,
		};
		const updated = updateSplitPercentage(node, ["first"], 60);
		if (typeof updated === "string") throw new Error("unexpected leaf");
		if (typeof updated.first === "string") throw new Error("unexpected leaf");
		expect(updated.first.splitPercentage).toBe(60);
		expect(updated.splitPercentage).toBe(50);
	});

	test("leaf node returns unchanged", () => {
		expect(updateSplitPercentage("a", [], 50)).toBe("a");
	});
});

describe("equalizeSplitPercentages", () => {
	test("leaf node returns unchanged", () => {
		expect(equalizeSplitPercentages("a")).toBe("a");
	});

	test("sets root splitPercentage to 50", () => {
		const node = { direction: "row" as const, first: "a", second: "b", splitPercentage: 70 };
		const result = equalizeSplitPercentages(node);
		if (typeof result === "string") throw new Error("unexpected leaf");
		expect(result.splitPercentage).toBe(50);
	});

	test("recursively equalizes nested nodes", () => {
		const node = {
			direction: "row" as const,
			splitPercentage: 70,
			first: { direction: "column" as const, first: "a", second: "b", splitPercentage: 30 },
			second: "c",
		};
		const result = equalizeSplitPercentages(node);
		if (typeof result === "string") throw new Error("unexpected leaf");
		if (typeof result.first === "string") throw new Error("unexpected leaf");
		expect(result.splitPercentage).toBe(50);
		expect(result.first.splitPercentage).toBe(50);
	});
});

describe("constants", () => {
	test("MIN_PERCENTAGE is 20", () => expect(MIN_PERCENTAGE).toBe(20));
	test("KEYBOARD_STEP is positive", () => expect(KEYBOARD_STEP).toBeGreaterThan(0));
});
