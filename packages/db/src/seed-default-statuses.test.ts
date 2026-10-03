import { describe, expect, test } from "bun:test";
import { startedStatusProgress } from "./seed-default-statuses";

describe("startedStatusProgress", () => {
	test("matches Linear's fill for one, two and three started states", () => {
		expect(startedStatusProgress(1)).toEqual([50]);
		expect(startedStatusProgress(2)).toEqual([50, 75]);
		expect(startedStatusProgress(3)).toEqual([25, 50, 75]);
	});

	test("spaces more states evenly below full", () => {
		expect(startedStatusProgress(4)).toEqual([20, 40, 60, 80]);
	});
});
