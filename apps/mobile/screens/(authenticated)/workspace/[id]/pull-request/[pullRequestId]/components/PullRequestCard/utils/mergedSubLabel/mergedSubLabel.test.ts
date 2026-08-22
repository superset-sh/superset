import { describe, expect, test } from "bun:test";
import { mergedSubLabel } from "./mergedSubLabel";

// Local-time constructor so the asserted wall-clock time holds in any timezone.
const mergedAt = new Date(2026, 7, 15, 15, 25);

describe("mergedSubLabel", () => {
	test("freshly merged pairs the relative moment with the full date", () => {
		expect(mergedSubLabel(mergedAt, mergedAt.getTime() + 30_000)).toBe(
			"now · August 15, 2026 at 3:25 PM",
		);
	});

	test("the relative half ages while the date stands", () => {
		expect(mergedSubLabel(mergedAt, mergedAt.getTime() + 3 * 86_400_000)).toBe(
			"3d · August 15, 2026 at 3:25 PM",
		);
	});
});
