import { describe, expect, test } from "bun:test";

import { healthFromLastActive, isChurnRisk } from "./customer-health";

const NOW = new Date("2026-07-12T12:00:00Z");

function daysAgo(days: number): Date {
	return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("healthFromLastActive", () => {
	test("returns dormant when never active", () => {
		expect(healthFromLastActive(null, NOW)).toBe("dormant");
	});

	test("returns active within 7 days", () => {
		expect(healthFromLastActive(NOW, NOW)).toBe("active");
		expect(healthFromLastActive(daysAgo(7), NOW)).toBe("active");
	});

	test("returns cooling between 8 and 21 days", () => {
		expect(healthFromLastActive(daysAgo(8), NOW)).toBe("cooling");
		expect(healthFromLastActive(daysAgo(21), NOW)).toBe("cooling");
	});

	test("returns dormant beyond 21 days", () => {
		expect(healthFromLastActive(daysAgo(22), NOW)).toBe("dormant");
		expect(healthFromLastActive(daysAgo(365), NOW)).toBe("dormant");
	});
});

describe("isChurnRisk", () => {
	test("flags paying + dormant", () => {
		expect(isChurnRisk("dormant", true)).toBe(true);
	});

	test("does not flag free or non-dormant", () => {
		expect(isChurnRisk("dormant", false)).toBe(false);
		expect(isChurnRisk("active", true)).toBe(false);
		expect(isChurnRisk("cooling", true)).toBe(false);
	});
});
