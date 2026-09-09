import { describe, expect, test } from "bun:test";
import { toolbarPlacement } from "./toolbarPlacement";

const EDGE = 12;
const GAP = 8;
const size = { width: 200, height: 40 };
const container = { width: 1000, height: 800 };

const place = (
	rect: { top: number; left: number; width: number; height: number },
	over = container,
) => toolbarPlacement({ rect, container: over, size });

describe("toolbarPlacement", () => {
	test("centres the toolbar over the selection", () => {
		expect(place({ top: 300, left: 400, width: 100, height: 50 }).left).toBe(
			400 + 50 - size.width / 2,
		);
	});

	test("sits above the selection when there is room", () => {
		expect(place({ top: 300, left: 400, width: 100, height: 50 }).top).toBe(
			300 - GAP - size.height,
		);
	});

	test("flips below the selection when it would clip the top", () => {
		expect(place({ top: 10, left: 400, width: 100, height: 50 }).top).toBe(
			10 + 50 + GAP,
		);
	});

	test("keeps the toolbar inside the left edge", () => {
		expect(place({ top: 300, left: 0, width: 20, height: 50 }).left).toBe(EDGE);
	});

	test("keeps the toolbar inside the right edge", () => {
		expect(place({ top: 300, left: 980, width: 20, height: 50 }).left).toBe(
			container.width - size.width - EDGE,
		);
	});

	test("stays on screen when flipping below a selection that fills the frame", () => {
		const top = place({ top: 0, left: 400, width: 100, height: 800 }).top;
		expect(top).toBeLessThanOrEqual(container.height - size.height - EDGE);
		expect(top).toBeGreaterThanOrEqual(EDGE);
	});

	test("never goes negative in a container narrower than the toolbar", () => {
		expect(
			place(
				{ top: 300, left: 0, width: 50, height: 20 },
				{ width: 80, height: 800 },
			).left,
		).toBe(EDGE);
	});

	test("never goes negative in an unmeasured container", () => {
		const placement = place(
			{ top: 0, left: 0, width: 0, height: 0 },
			{ width: 0, height: 0 },
		);
		expect(placement.left).toBe(EDGE);
		expect(placement.top).toBe(EDGE);
	});
});
