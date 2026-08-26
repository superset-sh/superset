import { describe, expect, test } from "bun:test";
import type {
	CommentAnchor,
	FrameRect,
} from "../../../../utils/commentRuntime";
import { pinPointOf, stackPins } from "./pinLayout";

const rect: FrameRect = { top: 100, left: 200, width: 400, height: 80 };

function anchorAt(offsetX?: number, offsetY?: number): CommentAnchor {
	return { path: "p:nth-of-type(1)", tag: "p", text: "", offsetX, offsetY };
}

describe("pinPointOf", () => {
	test("places the pin where inside the element the reader clicked", () => {
		expect(pinPointOf(rect, anchorAt(0.5, 0.5))).toEqual({ x: 400, y: 140 });
	});

	test("keeps the pin inside the element when the click was on its edge", () => {
		expect(pinPointOf(rect, anchorAt(0, 0))).toEqual({ x: 212, y: 112 });
		expect(pinPointOf(rect, anchorAt(1, 1))).toEqual({ x: 588, y: 168 });
	});

	test("centres on a target too small to inset into", () => {
		const thin: FrameRect = { top: 10, left: 10, width: 400, height: 4 };
		expect(pinPointOf(thin, anchorAt(0.25, 1))).toEqual({ x: 110, y: 12 });
	});

	test("falls back to the corner for a thread written before click points", () => {
		expect(pinPointOf(rect, anchorAt())).toEqual({ x: 200, y: 100 });
	});
});

describe("stackPins", () => {
	test("leaves pins that do not overlap at their own click point", () => {
		const indexes = stackPins([
			{ id: "a", point: { x: 0, y: 0 } },
			{ id: "b", point: { x: 200, y: 0 } },
			{ id: "c", point: { x: 0, y: 60 } },
		]);
		expect(indexes).toEqual({ a: 0, b: 0, c: 0 });
	});

	test("fans out pins dropped on the same spot", () => {
		const indexes = stackPins([
			{ id: "a", point: { x: 50, y: 50 } },
			{ id: "b", point: { x: 50, y: 50 } },
			{ id: "c", point: { x: 56, y: 54 } },
		]);
		expect(indexes).toEqual({ a: 0, b: 1, c: 2 });
	});

	test("steps past a pin already fanned into the spot it wants", () => {
		const indexes = stackPins([
			{ id: "a", point: { x: 0, y: 0 } },
			{ id: "b", point: { x: 0, y: 0 } },
			{ id: "c", point: { x: 20, y: 0 } },
		]);
		expect(indexes).toEqual({ a: 0, b: 1, c: 1 });
	});
});
