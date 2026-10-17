import { describe, expect, it } from "bun:test";
import { wheelScrollDelta } from "./utils";

describe("wheelScrollDelta", () => {
	it("translates a vertical-dominant wheel to horizontal pixels", () => {
		expect(wheelScrollDelta({ deltaX: 0, deltaY: 120, deltaMode: 0 })).toBe(
			120,
		);
		expect(wheelScrollDelta({ deltaX: 0, deltaY: -40, deltaMode: 0 })).toBe(
			-40,
		);
	});

	it("ignores horizontal-dominant input so trackpads don't scroll twice", () => {
		expect(wheelScrollDelta({ deltaX: 50, deltaY: 10, deltaMode: 0 })).toBe(0);
		expect(wheelScrollDelta({ deltaX: 20, deltaY: 20, deltaMode: 0 })).toBe(0);
	});

	it("scales line-mode deltas (legacy mouse wheels) to pixels", () => {
		expect(wheelScrollDelta({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toBe(48);
	});
});
