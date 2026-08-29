import { describe, expect, it } from "bun:test";
import { mapAgyQuotaWindows } from "./agy-quota";

describe("mapAgyQuotaWindows", () => {
	it("maps the four stable session and weekly buckets", () => {
		const windows = mapAgyQuotaWindows({
			groups: [
				{
					buckets: [
						{
							bucketId: "gemini-weekly",
							remainingFraction: 0.98,
							resetTime: "2026-09-01T00:00:00Z",
						},
						{
							bucketId: "gemini-5h",
							remainingFraction: 0.875,
							resetTime: "2026-08-28T20:00:00Z",
						},
					],
				},
				{
					buckets: [
						{ bucketId: "3p-weekly", remainingFraction: 0.75 },
						{ bucketId: "3p-5h", remainingFraction: 0.5 },
					],
				},
			],
		});
		expect(windows.map(({ id, usedPercent }) => [id, usedPercent])).toEqual([
			["gemini-5h", 13],
			["gemini-weekly", 2],
			["3p-5h", 50],
			["3p-weekly", 25],
		]);
	});
});
