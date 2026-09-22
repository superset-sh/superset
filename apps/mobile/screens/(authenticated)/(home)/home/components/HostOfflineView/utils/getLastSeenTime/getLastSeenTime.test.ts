import { describe, expect, test } from "bun:test";
import { formatRelativeTime } from "@superset/i18n/format";
import { getLastSeenTime } from "./getLastSeenTime";

const NOW = Date.UTC(2026, 8, 18, 12, 0, 0);

describe("getLastSeenTime", () => {
	test("keeps a past timestamp as is", () => {
		expect(getLastSeenTime(NOW - 60_000, NOW)).toBe(NOW - 60_000);
	});

	test("clamps a timestamp ahead of the phone's clock to now", () => {
		expect(getLastSeenTime(NOW + 3_000, NOW)).toBe(NOW);
	});

	test("never renders a future relative time", () => {
		const skewed = NOW + 90_000;
		expect(formatRelativeTime(skewed, NOW, undefined, "en")).toBe(
			"in 2 minutes",
		);
		expect(
			formatRelativeTime(getLastSeenTime(skewed, NOW), NOW, undefined, "en"),
		).toBe("now");
	});
});
