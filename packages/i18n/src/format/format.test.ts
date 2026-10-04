import { describe, expect, test } from "bun:test";
import { i18n, initI18n } from "../index";
import {
	formatAge,
	formatCompactNumber,
	formatCompactRelativeTime,
	formatCurrency,
	formatDate,
	formatNumber,
	formatPercent,
	formatPrice,
	formatRelativePeriod,
	formatRelativeTime,
	getActiveLocale,
	getNumberSeparators,
} from "./index";

initI18n();

describe("format helpers (en)", () => {
	test("active locale defaults to en", () => {
		expect(getActiveLocale()).toBe("en");
	});

	test("formatNumber groups digits", () => {
		expect(formatNumber(1234567)).toBe("1,234,567");
	});

	test("formatPercent renders one fractional digit by default", () => {
		expect(formatPercent(0.123)).toBe("12.3%");
		expect(formatPercent(1)).toBe("100%");
	});

	test("formatCompactNumber matches the previous en-US output", () => {
		expect(formatCompactNumber(123400)).toBe("123K");
		expect(formatCompactNumber(1500000)).toBe("1.5M");
	});

	test("formatCurrency renders major units", () => {
		expect(formatCurrency(12.5)).toBe("$12.50");
		expect(formatCurrency(19211, "USD", { maximumFractionDigits: 0 })).toBe(
			"$19,211",
		);
	});

	test("formatPrice renders Stripe minor units and uppercases currency", () => {
		expect(formatPrice(1250, "usd")).toBe("$12.50");
		expect(formatPrice(0, "USD")).toBe("$0.00");
	});

	test("getNumberSeparators follows the locale", () => {
		expect(getNumberSeparators()).toEqual({ group: ",", decimal: "." });
		expect(getNumberSeparators("fr")).toEqual({
			group: "\u202f",
			decimal: ",",
		});
		expect(getNumberSeparators("de")).toEqual({ group: ".", decimal: "," });
	});

	test("formatDate default matches the settings-page shape", () => {
		expect(formatDate(new Date(2026, 0, 15))).toBe("Jan 15, 2026");
	});
});

describe("formatRelativeTime", () => {
	const NOW = new Date("2026-08-28T12:00:00Z");

	test("formats past times", () => {
		expect(formatRelativeTime(new Date("2026-08-28T09:00:00Z"), NOW)).toBe(
			"3 hours ago",
		);
	});

	test("uses idiomatic wording where the locale has one", () => {
		expect(formatRelativeTime(new Date("2026-08-27T12:00:00Z"), NOW)).toBe(
			"yesterday",
		);
	});

	test("formats future times", () => {
		expect(formatRelativeTime(new Date("2026-08-30T12:00:00Z"), NOW)).toBe(
			"in 2 days",
		);
	});

	test("falls back to seconds below a minute", () => {
		expect(formatRelativeTime(new Date("2026-08-28T11:59:59Z"), NOW)).toBe(
			"1 second ago",
		);
	});

	test("the same instant reads as now, not as zero seconds", () => {
		expect(formatCompactRelativeTime(NOW, NOW)).toBe("now");
		expect(formatRelativeTime(NOW, NOW, { numeric: "always" }, "de")).toBe(
			"jetzt",
		);
	});

	test("compact form never shows seconds", () => {
		expect(
			formatCompactRelativeTime(new Date("2026-08-28T11:59:20Z"), NOW),
		).toBe("now");
		expect(
			formatCompactRelativeTime(new Date("2026-08-28T11:58:59Z"), NOW),
		).toBe("1m ago");
	});

	test("compact form uses the narrow style", () => {
		expect(
			formatCompactRelativeTime(new Date("2026-08-25T12:00:00Z"), NOW),
		).toBe("3d ago");
	});

	test("a timestamp that leads the clock still reads as the present", () => {
		const justPosted = new Date(NOW.getTime() + 400);
		expect(formatCompactRelativeTime(justPosted, NOW)).toBe("now");
		expect(formatCompactRelativeTime(NOW, NOW)).toBe("now");
	});

	test("a real future time keeps the future tense", () => {
		expect(
			formatCompactRelativeTime(new Date(NOW.getTime() + 2 * 3600 * 1000), NOW),
		).toBe("in 2h");
	});

	test("age fits two digits and a unit", () => {
		const now = new Date("2026-08-28T12:00:00Z").getTime();
		const minute = 60 * 1000;
		const day = 24 * 60 * minute;
		const ages = [
			[20 * 1000, "now"],
			[59 * minute, "59m"],
			[60 * minute, "1h"],
			[13 * day, "13d"],
			[14 * day, "2w"],
			[364 * day, "52w"],
			[365 * day, "1y"],
		] as const;
		for (const [elapsed, expected] of ages) {
			expect(formatAge(now - elapsed, now)).toBe(expected);
		}
	});

	test("compact form never reads as a negative number", () => {
		expect(
			formatCompactRelativeTime(
				new Date("2026-08-28T11:55:00Z"),
				NOW,
				"fr",
			).replace(/\s/g, " "),
		).toBe("il y a 5 min");
	});

	test("age keeps a non-Latin locale's own units", () => {
		const now = new Date("2026-08-28T12:00:00Z").getTime();
		const day = 24 * 60 * 60 * 1000;
		const age = formatAge(now - 28 * day, now, "ja");
		expect(age).toContain("4");
		expect(age).not.toMatch(/[a-z]/i);
	});

	test("follows the active locale", () => {
		i18n.activate("ja");
		try {
			expect(formatRelativeTime(new Date("2026-08-25T12:00:00Z"), NOW)).toBe(
				"3 日前",
			);
		} finally {
			i18n.activate("en");
		}
	});
});

describe("formatRelativePeriod", () => {
	test("names recent periods the way a list heading would", () => {
		expect(formatRelativePeriod({ unit: "day", count: 0 }, "en")).toBe("Today");
		expect(formatRelativePeriod({ unit: "day", count: 1 }, "en")).toBe(
			"Yesterday",
		);
		expect(formatRelativePeriod({ unit: "day", count: 3 }, "en")).toBe(
			"3 days ago",
		);
		expect(formatRelativePeriod({ unit: "week", count: 1 }, "en")).toBe(
			"Last week",
		);
	});
});
