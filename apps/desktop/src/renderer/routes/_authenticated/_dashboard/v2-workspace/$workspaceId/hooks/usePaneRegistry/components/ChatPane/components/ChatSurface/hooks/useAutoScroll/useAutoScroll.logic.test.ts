import { describe, expect, it } from "bun:test";
import {
	canScroll,
	distanceFromBottom,
	isInsideNestedScrollable,
} from "./useAutoScroll.logic";

function el({
	scrollHeight,
	clientHeight,
	scrollTop,
}: {
	scrollHeight: number;
	clientHeight: number;
	scrollTop: number;
}): HTMLElement {
	return {
		scrollHeight,
		clientHeight,
		scrollTop,
	} as unknown as HTMLElement;
}

describe("distanceFromBottom", () => {
	it("is zero when scrolled all the way down", () => {
		expect(
			distanceFromBottom(
				el({ scrollHeight: 1000, clientHeight: 500, scrollTop: 500 }),
			),
		).toBe(0);
	});
	it("equals total overflow when scrolled to top", () => {
		expect(
			distanceFromBottom(
				el({ scrollHeight: 1000, clientHeight: 500, scrollTop: 0 }),
			),
		).toBe(500);
	});
});

describe("canScroll", () => {
	it("true only when content exceeds viewport", () => {
		expect(
			canScroll(el({ scrollHeight: 400, clientHeight: 300, scrollTop: 0 })),
		).toBe(true);
		expect(
			canScroll(el({ scrollHeight: 300, clientHeight: 300, scrollTop: 0 })),
		).toBe(false);
		expect(
			canScroll(el({ scrollHeight: 200, clientHeight: 300, scrollTop: 0 })),
		).toBe(false);
	});
});

describe("isInsideNestedScrollable", () => {
	// Production code duck-types `closest`, so tests can use plain
	// objects and run in Bun's DOM-less runner.
	const outer = { tagName: "DIV" } as unknown as HTMLElement;

	it("returns false when target is null", () => {
		expect(isInsideNestedScrollable(null, outer)).toBe(false);
	});

	it("returns false when target has no .closest method", () => {
		expect(
			isInsideNestedScrollable({} as unknown as EventTarget, outer),
		).toBe(false);
	});

	it("returns true when closest returns a different data-scrollable", () => {
		const nested = { tagName: "PRE" } as unknown as Element;
		const target = {
			closest: (selector: string) =>
				selector === "[data-scrollable]" ? nested : null,
		} as unknown as EventTarget;
		expect(isInsideNestedScrollable(target, outer)).toBe(true);
	});

	it("returns false when closest returns the outer itself", () => {
		const target = {
			closest: (selector: string) =>
				selector === "[data-scrollable]" ? outer : null,
		} as unknown as EventTarget;
		expect(isInsideNestedScrollable(target, outer)).toBe(false);
	});

	it("returns false when the target has no nested data-scrollable ancestor", () => {
		const target = {
			closest: () => null,
		} as unknown as EventTarget;
		expect(isInsideNestedScrollable(target, outer)).toBe(false);
	});
});
