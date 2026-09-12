import { describe, expect, test } from "bun:test";
import { getNewGroupTabOrder } from "./getNewGroupTabOrder";

describe("getNewGroupTabOrder", () => {
	test("replaces the source workspace slot without moving later siblings", () => {
		expect(
			getNewGroupTabOrder([{ tabOrder: 2, isGrouped: false }], [1, 2, 3, 8], 9),
		).toBe(2);
	});
	test("uses the first visual position regardless of selection order", () => {
		expect(
			getNewGroupTabOrder(
				[
					{ tabOrder: 8, isGrouped: false },
					{ tabOrder: 2, isGrouped: false },
				],
				[1, 2, 3, 8],
				9,
			),
		).toBe(2);
	});
	test("places a former group member between that group and its next sibling", () => {
		expect(
			getNewGroupTabOrder(
				[{ tabOrder: 2, isGrouped: true }],
				[1, 2, 2.5, 8],
				9,
			),
		).toBe(2.25);
	});
	test("places a member of the last group immediately after it", () => {
		expect(
			getNewGroupTabOrder([{ tabOrder: 8, isGrouped: true }], [1, 2, 8], 9),
		).toBe(9);
	});
	test("keeps standalone group creation at the supplied default", () => {
		expect(getNewGroupTabOrder([], [1, 2, 8], 9)).toBe(9);
	});
});
