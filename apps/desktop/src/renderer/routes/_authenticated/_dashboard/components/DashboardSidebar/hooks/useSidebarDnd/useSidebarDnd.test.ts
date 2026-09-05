import { describe, expect, test } from "bun:test";
import { hasInFlightRowWrite, wsId } from "./useSidebarDnd";

const rows = new Map([
	[wsId("a"), "sessions"],
	[wsId("b"), "project-1"],
]);

describe("hasInFlightRowWrite", () => {
	test("holds while a sidebar row has an unsettled host update", () => {
		expect(hasInFlightRowWrite({ a: { type: "update" } }, rows)).toBe(true);
		expect(hasInFlightRowWrite({ b: { type: "update" } }, rows)).toBe(true);
	});

	test("ignores writes for rows outside the drag model", () => {
		expect(hasInFlightRowWrite({ zzz: { type: "update" } }, rows)).toBe(false);
	});

	test("does not hold on inserts or deletes", () => {
		expect(
			hasInFlightRowWrite(
				{ a: { type: "insert" }, b: { type: "delete" } },
				rows,
			),
		).toBe(false);
	});

	test("is false with nothing in flight", () => {
		expect(hasInFlightRowWrite({}, rows)).toBe(false);
	});
});
