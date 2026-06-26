import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { HostMetrics } from "../../types";
import {
	getNormalizedHostCpuPercent,
	HostResourceSection,
} from "./HostResourceSection";

const GB = 1024 * 1024 * 1024;

function makeHost(overrides: Partial<HostMetrics> = {}): HostMetrics {
	return {
		totalMemory: 16 * GB,
		freeMemory: 4 * GB,
		usedMemory: 12 * GB,
		memoryUsagePercent: 75,
		cpuCoreCount: 8,
		loadAverage1m: 4,
		...overrides,
	};
}

describe("getNormalizedHostCpuPercent", () => {
	test("normalises load average against core count", () => {
		expect(
			getNormalizedHostCpuPercent(
				makeHost({ cpuCoreCount: 8, loadAverage1m: 4 }),
			),
		).toBeCloseTo(50);
	});

	test("clamps over-saturated load to 100%", () => {
		expect(
			getNormalizedHostCpuPercent(
				makeHost({ cpuCoreCount: 4, loadAverage1m: 32 }),
			),
		).toBe(100);
	});

	test("returns 0 when core count is missing or invalid", () => {
		expect(
			getNormalizedHostCpuPercent(
				makeHost({ cpuCoreCount: 0, loadAverage1m: 2 }),
			),
		).toBe(0);
	});
});

describe("HostResourceSection", () => {
	test("renders host-wide RAM and CPU load so users can tell whether pressure is from Superset or the rest of the system", () => {
		const markup = renderToStaticMarkup(
			<HostResourceSection host={makeHost()} />,
		);

		expect(markup).toContain("System");
		expect(markup).toContain("75% RAM");
		expect(markup).toContain("CPU load (1m)");
		expect(markup).toContain("50% of 8 cores");
		expect(markup).toContain("RAM used");
		expect(markup).toContain("12.00 GB");
		expect(markup).toContain("RAM free");
		expect(markup).toContain("4.00 GB");
	});

	test("survives a degenerate snapshot without crashing", () => {
		const markup = renderToStaticMarkup(
			<HostResourceSection
				host={makeHost({
					totalMemory: 0,
					freeMemory: 0,
					usedMemory: 0,
					memoryUsagePercent: 0,
					cpuCoreCount: 1,
					loadAverage1m: 0,
				})}
			/>,
		);

		expect(markup).toContain("System");
		expect(markup).toContain("0% RAM");
		expect(markup).toContain("0% of 1 cores");
	});
});
