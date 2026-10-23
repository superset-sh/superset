import { describe, expect, test } from "bun:test";
import { repaintNudgeIntermediateSize } from "./repaint-nudge";

describe("repaintNudgeIntermediateSize", () => {
	test("shrinks both axes so the interim frame cannot wrap", () => {
		expect(repaintNudgeIntermediateSize(80, 24)).toEqual({
			cols: 79,
			rows: 23,
		});
	});

	test("grows an axis that cannot shrink", () => {
		expect(repaintNudgeIntermediateSize(1, 1)).toEqual({
			cols: 2,
			rows: 2,
		});
	});
});
