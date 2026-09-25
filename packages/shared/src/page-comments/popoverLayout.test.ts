import { describe, expect, test } from "bun:test";
import { popoverPlacement } from "./popoverLayout";

const WIDTH = 350;
const EDGE = 12;
const PIN_SIZE = 24;
const point = { x: 100, y: 40 };
const tall = { width: 0, height: 2000 };

const place = (width: number, height = 200) =>
	popoverPlacement({
		point,
		container: { ...tall, width },
		height,
		pinSize: PIN_SIZE,
	});

describe("popoverPlacement width", () => {
	test("uses the full width when the container has room", () => {
		expect(place(800).width).toBe(WIDTH);
	});

	test("keeps full width at the exact fitting width", () => {
		expect(place(WIDTH + EDGE * 2).width).toBe(WIDTH);
	});

	test("shrinks to fit a narrow container instead of overflowing", () => {
		expect(place(300).width).toBe(300 - EDGE * 2);
	});

	test("never returns a negative width for an unmeasured container", () => {
		expect(place(0).width).toBeGreaterThan(0);
	});

	test("never returns a negative width for a hidden pane", () => {
		expect(place(20).width).toBeGreaterThan(0);
	});
});

describe("popoverPlacement horizontal fit", () => {
	test.each([
		200, 300, 373, 374, 500, 800,
	])("stays within the container at width %i", (containerWidth) => {
		const { left, width } = place(containerWidth);
		if (containerWidth >= 264) {
			expect(left + width).toBeLessThanOrEqual(containerWidth);
		}
		expect(left).toBeGreaterThanOrEqual(EDGE);
	});

	test("keeps the edge margin on the right in a narrow container", () => {
		const { left, width } = place(300);
		expect(300 - (left + width)).toBe(EDGE);
	});
});

describe("popoverPlacement vertical flip", () => {
	test("hangs below the pin when there is room", () => {
		const { top } = popoverPlacement({
			point,
			container: { width: 800, height: 2000 },
			height: 200,
			pinSize: PIN_SIZE,
		});
		expect(top).toBeGreaterThan(point.y);
	});

	test("flips above the pin when the card would overflow the bottom", () => {
		const { top } = popoverPlacement({
			point: { x: 100, y: 380 },
			container: { width: 800, height: 400 },
			height: 200,
			pinSize: PIN_SIZE,
		});
		expect(top).toBeLessThan(380);
		expect(top).toBeGreaterThanOrEqual(EDGE);
	});
});

describe("popoverPlacement pinSize", () => {
	test("a flip clears the whole block when pinSize is the block's height", () => {
		const blockTop = 300;
		const blockHeight = 260;
		const { top } = popoverPlacement({
			point: { x: 40, y: blockTop + blockHeight },
			container: { width: 400, height: 700 },
			height: 200,
			pinSize: blockHeight,
		});
		expect(top + 200).toBeLessThanOrEqual(blockTop);
	});

	test("the keyboard taking the bottom flips the card clear of its block", () => {
		const blockTop = 300;
		const blockHeight = 120;
		const cardHeight = 180;
		const { top } = popoverPlacement({
			point: { x: 40, y: blockTop + blockHeight },
			container: { width: 390, height: 800 - 340 },
			height: cardHeight,
			pinSize: blockHeight,
		});
		expect(top + cardHeight).toBeLessThanOrEqual(blockTop);
		expect(top).toBeGreaterThanOrEqual(EDGE);
	});

	test("a taller pin pushes a flipped card further up", () => {
		const args = {
			point: { x: 40, y: 380 },
			container: { width: 800, height: 400 },
			height: 200,
		};
		const small = popoverPlacement({ ...args, pinSize: 24 });
		const large = popoverPlacement({ ...args, pinSize: 120 });
		expect(large.top).toBe(small.top - (120 - 24));
	});

	test("pinSize does not move a card that still hangs below", () => {
		const args = {
			point,
			container: { width: 800, height: 2000 },
			height: 200,
		};
		expect(popoverPlacement({ ...args, pinSize: 200 }).top).toBe(
			popoverPlacement({ ...args, pinSize: 24 }).top,
		);
	});
});

describe("popoverPlacement maxWidth", () => {
	test("a container-wide cap fills the container minus its margins", () => {
		const { left, width } = popoverPlacement({
			point: { x: 0, y: 40 },
			container: { width: 390, height: 800 },
			height: 200,
			pinSize: 24,
			maxWidth: 390,
		});
		expect(width).toBe(390 - EDGE * 2);
		expect(left).toBe(EDGE);
	});

	test("caps below the default when asked to", () => {
		expect(
			popoverPlacement({
				point,
				container: { width: 800, height: 800 },
				height: 200,
				pinSize: 24,
				maxWidth: 280,
			}).width,
		).toBe(280);
	});

	test("never drops under the readable minimum", () => {
		expect(
			popoverPlacement({
				point,
				container: { width: 800, height: 800 },
				height: 200,
				pinSize: 24,
				maxWidth: 50,
			}).width,
		).toBe(240);
	});
});
