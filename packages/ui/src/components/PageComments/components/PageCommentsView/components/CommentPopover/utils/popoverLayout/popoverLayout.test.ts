import { describe, expect, test } from "bun:test";
import { popoverPlacement } from "./popoverLayout";

const WIDTH = 350;
const EDGE = 12;
const point = { x: 100, y: 40 };
const tall = { width: 0, height: 2000 };

const place = (width: number, height = 200) =>
	popoverPlacement({ point, container: { ...tall, width }, height });

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
		});
		expect(top).toBeGreaterThan(point.y);
	});

	test("flips above the pin when the card would overflow the bottom", () => {
		const { top } = popoverPlacement({
			point: { x: 100, y: 380 },
			container: { width: 800, height: 400 },
			height: 200,
		});
		expect(top).toBeLessThan(380);
		expect(top).toBeGreaterThanOrEqual(EDGE);
	});
});
