import { describe, expect, it } from "bun:test";
import { recordTransientErrorInWindow } from "./transient-error-window";

describe("recordTransientErrorInWindow", () => {
	it("keeps only timestamps inside the window", () => {
		const timestamps: number[] = [];

		expect(recordTransientErrorInWindow(timestamps, 0, 1000)).toBe(1);
		expect(recordTransientErrorInWindow(timestamps, 400, 1000)).toBe(2);
		expect(recordTransientErrorInWindow(timestamps, 900, 1000)).toBe(3);
		expect(recordTransientErrorInWindow(timestamps, 1500, 1000)).toBe(2);

		expect(timestamps).toEqual([900, 1500]);
	});

	it("retains timestamp exactly at cutoff boundary", () => {
		const timestamps: number[] = [];

		expect(recordTransientErrorInWindow(timestamps, 500, 1000)).toBe(1);
		expect(recordTransientErrorInWindow(timestamps, 1500, 1000)).toBe(2);

		expect(timestamps).toEqual([500, 1500]);
	});

	it("drops all stale timestamps after a long quiet period", () => {
		const timestamps: number[] = [];

		recordTransientErrorInWindow(timestamps, 100, 1000);
		recordTransientErrorInWindow(timestamps, 200, 1000);
		recordTransientErrorInWindow(timestamps, 300, 1000);

		expect(recordTransientErrorInWindow(timestamps, 5000, 1000)).toBe(1);
		expect(timestamps).toEqual([5000]);
	});
});
