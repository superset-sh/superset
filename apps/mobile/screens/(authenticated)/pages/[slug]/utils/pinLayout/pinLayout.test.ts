import { describe, expect, test } from "bun:test";
import type { CommentAnchor } from "@superset/shared/page-comments-runtime";
import { PIN_SIZE, pinPointOf, STACK_OFFSET, stackPins } from "./pinLayout";

const rect = { left: 100, top: 200, width: 400, height: 100 };

function anchor(offsetX?: number, offsetY?: number): CommentAnchor {
	return { path: "body>p", tag: "p", text: "", offsetX, offsetY };
}

describe("pinPointOf", () => {
	test("keeps the old top-left placement for an anchor with no offsets", () => {
		expect(pinPointOf(rect, anchor())).toEqual({ x: 100, y: 200 });
	});

	test("places the pin at the click fraction", () => {
		expect(pinPointOf(rect, anchor(0.5, 0.5))).toEqual({ x: 300, y: 250 });
	});

	test("insets so the pin cannot hang off the element it belongs to", () => {
		const topLeft = pinPointOf(rect, anchor(0, 0));
		expect(topLeft.x).toBe(100 + PIN_SIZE / 2);
		expect(topLeft.y).toBe(200 + PIN_SIZE / 2);
	});

	test("centres on a target thinner than the pin, which has no room to inset", () => {
		const thin = { left: 0, top: 0, width: 10, height: 10 };
		expect(pinPointOf(thin, anchor(1, 1))).toEqual({ x: 5, y: 5 });
	});
});

describe("stackPins", () => {
	test("leaves pins far enough apart at index 0", () => {
		const indexes = stackPins([
			{ id: "a", point: { x: 0, y: 0 } },
			{ id: "b", point: { x: STACK_OFFSET * 4, y: 0 } },
		]);
		expect(indexes).toEqual({ a: 0, b: 0 });
	});

	test("fans out pins that land on the same spot", () => {
		const indexes = stackPins([
			{ id: "a", point: { x: 10, y: 10 } },
			{ id: "b", point: { x: 10, y: 10 } },
			{ id: "c", point: { x: 10, y: 10 } },
		]);
		expect(indexes).toEqual({ a: 0, b: 1, c: 2 });
	});
});
