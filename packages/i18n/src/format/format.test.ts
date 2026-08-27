import { describe, expect, test } from "bun:test";
import { initI18n } from "../index";
import {
	formatCompactNumber,
	formatCurrency,
	formatDate,
	formatNumber,
	formatPercent,
	formatPrice,
	getActiveLocale,
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

	test("formatDate default matches the settings-page shape", () => {
		expect(formatDate(new Date(2026, 0, 15))).toBe("Jan 15, 2026");
	});
});
