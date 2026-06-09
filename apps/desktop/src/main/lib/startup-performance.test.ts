import { describe, expect, test } from "bun:test";
import {
	getStartupPerformanceReport,
	markStartup,
} from "./startup-performance";

describe("startup performance timeline", () => {
	test("records marks and adjacent durations", () => {
		markStartup("test:startup-performance-mark");

		const report = getStartupPerformanceReport();
		const mark = report.marks.find(
			(entry) => entry.name === "test:startup-performance-mark",
		);

		expect(report.processStartedAt).toBeTruthy();
		expect(report.uptimeMs).toBeGreaterThanOrEqual(0);
		expect(mark).toBeDefined();
		expect(report.durations.length).toBeGreaterThan(0);
		expect(report.durations.every((duration) => duration.durationMs >= 0)).toBe(
			true,
		);
	});
});
