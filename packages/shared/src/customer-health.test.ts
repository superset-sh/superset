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

	test("returns idle between 8 and 14 days", () => {
		expect(healthFromLastActive(daysAgo(8), NOW)).toBe("idle");
		expect(healthFromLastActive(daysAgo(14), NOW)).toBe("idle");
	});

	test("returns cooling between 15 and 30 days", () => {
		expect(healthFromLastActive(daysAgo(15), NOW)).toBe("cooling");
		expect(healthFromLastActive(daysAgo(30), NOW)).toBe("cooling");
	});

	test("returns dormant beyond 30 days", () => {
		expect(healthFromLastActive(daysAgo(31), NOW)).toBe("dormant");
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
