import { describe, expect, it } from "bun:test";
import { getDropTarget } from "./dropTarget";

/** 1440×1100 content area — a typical full-width panel */
const bigPanel = {
	left: 0,
	top: 0,
	right: 1440,
	bottom: 1100,
	width: 1440,
	height: 1100,
};

describe("getDropTarget", () => {
	it("dropping directly over a panel combines (center), even near the bar", () => {
		// 120px below the tab bar of a tall panel: proportional zones called
		// this "top" and split — it must combine into the tab group instead.
		expect(getDropTarget(720, 120, bigPanel)).toBe("center");
		expect(getDropTarget(720, 550, bigPanel)).toBe("center");
		// Inside the horizontal band cap but away from edges
		expect(getDropTarget(150, 550, bigPanel)).toBe("center");
	});

	it("outer bands split toward their edge", () => {
		expect(getDropTarget(40, 550, bigPanel)).toBe("left");
		expect(getDropTarget(1400, 550, bigPanel)).toBe("right");
		expect(getDropTarget(720, 30, bigPanel)).toBe("top");
		expect(getDropTarget(720, 1080, bigPanel)).toBe("bottom");
	});

	it("corners resolve to the nearest edge", () => {
		expect(getDropTarget(10, 90, bigPanel)).toBe("left");
		expect(getDropTarget(90, 10, bigPanel)).toBe("top");
	});

	it("small panels keep proportional bands", () => {
		const small = {
			left: 0,
			top: 0,
			right: 300,
			bottom: 200,
			width: 300,
			height: 200,
		};
		// 20% bands: x band = 60px, y band = 40px
		expect(getDropTarget(150, 100, small)).toBe("center");
		expect(getDropTarget(30, 100, small)).toBe("left");
		expect(getDropTarget(150, 20, small)).toBe("top");
		expect(getDropTarget(150, 185, small)).toBe("bottom");
	});
});
