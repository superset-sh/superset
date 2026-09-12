import { describe, expect, test } from "bun:test";
import { formatReleaseDate } from "./formatReleaseDate";

describe("formatReleaseDate", () => {
	// The real desktop-v1.25.1 timestamp. 05:13Z is still Aug 30 in US-Pacific,
	// so an unpinned zone renders a different day on the server than in the
	// browser and React reports a hydration mismatch.
	test("pins UTC so the day never shifts with the viewer's zone", () => {
		expect(formatReleaseDate("2026-08-31T05:13:44Z")).toBe("Aug 31, 2026");
	});

	test("holds across a timezone change", () => {
		const original = process.env.TZ;
		try {
			process.env.TZ = "America/Los_Angeles";
			expect(formatReleaseDate("2026-08-31T05:13:44Z")).toBe("Aug 31, 2026");
			process.env.TZ = "Asia/Tokyo";
			expect(formatReleaseDate("2026-08-31T05:13:44Z")).toBe("Aug 31, 2026");
		} finally {
			process.env.TZ = original;
		}
	});
});
