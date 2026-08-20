import { describe, expect, it } from "bun:test";
import { dragPosition } from "./geometry";

describe("dragPosition", () => {
	it("translates by the pointer delta", () => {
		const next = dragPosition(
			{ x: 100, y: 50, pointerX: 300, pointerY: 200 },
			{ pointerX: 340, pointerY: 260 },
		);
		expect(next).toEqual({ x: 140, y: 110 });
	});

	it("never returns a negative position", () => {
		const next = dragPosition(
			{ x: 10, y: 10, pointerX: 300, pointerY: 200 },
			{ pointerX: 100, pointerY: 100 },
		);
		expect(next).toEqual({ x: 0, y: 0 });
	});
});
