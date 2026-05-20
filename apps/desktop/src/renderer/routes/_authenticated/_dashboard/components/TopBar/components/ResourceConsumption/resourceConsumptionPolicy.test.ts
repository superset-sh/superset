import { describe, expect, test } from "bun:test";
import {
	getResourceMonitorRefetchInterval,
	shouldQueryResourceMonitor,
} from "./resourceConsumptionPolicy";

describe("resourceConsumptionPolicy", () => {
	test("keeps resource metrics cold while the popover is closed", () => {
		for (let i = 0; i < 10_000; i += 1) {
			expect(
				shouldQueryResourceMonitor({
					enabled: true,
					open: false,
				}),
			).toBe(false);
			expect(getResourceMonitorRefetchInterval(false)).toBe(false);
		}
	});

	test("enables polling only after the popover is open", () => {
		expect(
			shouldQueryResourceMonitor({
				enabled: true,
				open: true,
			}),
		).toBe(true);
		expect(
			shouldQueryResourceMonitor({
				enabled: false,
				open: true,
			}),
		).toBe(false);
		expect(getResourceMonitorRefetchInterval(true)).toBe(2_000);
	});
});
