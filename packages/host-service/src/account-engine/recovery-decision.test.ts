import { describe, expect, it } from "bun:test";
import type { UsageQuotaWindow } from "../trpc/router/usage/types.ts";
import { hasRecoveryHeadroom } from "./recovery-decision.ts";

const windows = (fable: number): UsageQuotaWindow[] => [
	{ id: "five_hour", label: "Session", usedPercent: 30, resetsAt: null },
	{ id: "seven_day", label: "Weekly", usedPercent: 30, resetsAt: null },
	{
		id: "weekly_scoped:Fable",
		label: "Fable",
		usedPercent: fable,
		resetsAt: null,
	},
];

describe("session recovery headroom", () => {
	for (const model of ["Fable", null]) {
		it(`refuses two Fable-exhausted accounts with model ${model}`, () => {
			expect(
				hasRecoveryHeadroom({
					agent: "claude",
					model,
					sourceWindows: windows(100),
					targetWindows: windows(100),
					thresholdPercent: 90,
				}),
			).toBe(false);
		});
	}
	it("requires the target to report the affected window", () => {
		expect(
			hasRecoveryHeadroom({
				agent: "claude",
				model: "Fable",
				sourceWindows: windows(100),
				targetWindows: windows(10).slice(0, 2),
				thresholdPercent: 90,
			}),
		).toBe(false);
	});
	it("accepts confirmed room for the affected model", () => {
		expect(
			hasRecoveryHeadroom({
				agent: "claude",
				model: "Fable",
				sourceWindows: windows(100),
				targetWindows: windows(10),
				thresholdPercent: 90,
			}),
		).toBe(true);
	});
	it("refuses unreadable quota and non-finite usage", () => {
		for (const targetWindows of [[], windows(Number.NaN)]) {
			expect(
				hasRecoveryHeadroom({
					agent: "claude",
					model: "Fable",
					sourceWindows: windows(100),
					targetWindows,
					thresholdPercent: 90,
				}),
			).toBe(false);
		}
	});
});
