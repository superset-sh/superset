import { describe, expect, it } from "bun:test";
import { getVisibleTabWindow, TAB_WIDTH } from "./utils";

describe("getVisibleTabWindow", () => {
	it("renders all tabs below the windowing threshold", () => {
		expect(
			getVisibleTabWindow({
				clientWidth: TAB_WIDTH * 2,
				scrollLeft: TAB_WIDTH * 3,
				tabCount: 12,
			}),
		).toEqual({ start: 0, end: 12 });
	});

	it("limits large tab sets to the visible range plus overscan", () => {
		expect(
			getVisibleTabWindow({
				clientWidth: TAB_WIDTH * 3,
				overscan: 2,
				scrollLeft: TAB_WIDTH * 10,
				tabCount: 80,
			}),
		).toEqual({ start: 8, end: 15 });
	});

	it("falls back to the initial window before layout has measured", () => {
		expect(
			getVisibleTabWindow({
				clientWidth: 0,
				scrollLeft: 0,
				tabCount: 80,
				windowingThreshold: 24,
			}),
		).toEqual({ start: 0, end: 24 });
	});
});
