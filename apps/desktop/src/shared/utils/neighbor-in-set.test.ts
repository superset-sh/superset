import { describe, expect, test } from "bun:test";
import { findNeighborInSet } from "./neighbor-in-set";

describe("findNeighborInSet", () => {
	test("empty ordered list returns null", () => {
		expect(findNeighborInSet([], "a", new Set(["a"]), "next")).toBeNull();
	});

	test("currentId not in ordered list returns null", () => {
		expect(
			findNeighborInSet(["a", "b"], "x", new Set(["a", "b"]), "next"),
		).toBeNull();
	});

	test("no members of filter returns null", () => {
		expect(
			findNeighborInSet(["a", "b", "c"], "b", new Set(), "next"),
		).toBeNull();
	});

	test("only current is in filter returns null", () => {
		expect(
			findNeighborInSet(["a", "b", "c"], "b", new Set(["b"]), "next"),
		).toBeNull();
	});

	test("next picks the next member in order", () => {
		expect(
			findNeighborInSet(["a", "b", "c", "d"], "a", new Set(["c", "d"]), "next"),
		).toBe("c");
	});

	test("next wraps around", () => {
		expect(
			findNeighborInSet(["a", "b", "c"], "c", new Set(["a"]), "next"),
		).toBe("a");
	});

	test("next skips current when current is in filter", () => {
		expect(
			findNeighborInSet(["a", "b", "c"], "b", new Set(["b", "c"]), "next"),
		).toBe("c");
	});

	test("prev picks the previous member in order", () => {
		expect(
			findNeighborInSet(["a", "b", "c", "d"], "d", new Set(["a", "b"]), "prev"),
		).toBe("b");
	});

	test("prev wraps around", () => {
		expect(
			findNeighborInSet(["a", "b", "c"], "a", new Set(["c"]), "prev"),
		).toBe("c");
	});

	test("prev skips current when current is in filter", () => {
		expect(
			findNeighborInSet(["a", "b", "c"], "b", new Set(["a", "b"]), "prev"),
		).toBe("a");
	});

	test("currentId not in filter still walks forward from its position", () => {
		expect(
			findNeighborInSet(["a", "b", "c", "d"], "b", new Set(["d"]), "next"),
		).toBe("d");
	});
});
