import { describe, expect, it } from "bun:test";
import { optionIndexForKey } from "./QuestionDock.logic";

describe("optionIndexForKey", () => {
	it("maps 1..9 to 0..8", () => {
		expect(optionIndexForKey("1")).toBe(0);
		expect(optionIndexForKey("5")).toBe(4);
		expect(optionIndexForKey("9")).toBe(8);
	});
	it("returns null for other keys", () => {
		expect(optionIndexForKey("0")).toBeNull();
		expect(optionIndexForKey("a")).toBeNull();
		expect(optionIndexForKey("")).toBeNull();
		expect(optionIndexForKey("Enter")).toBeNull();
	});
});
