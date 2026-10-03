import { describe, expect, test } from "bun:test";
import {
	clearable,
	dateArg,
	money,
	monthArg,
	signed,
	toMilliunits,
} from "./api";

describe("milliunits", () => {
	test("converts currency units to milliunits", () => {
		expect(toMilliunits(-12.34)).toBe(-12340);
		expect(toMilliunits(450)).toBe(450000);
		expect(toMilliunits(0.005)).toBe(5);
	});

	test("renders milliunits back as currency units", () => {
		expect(money(-12340)).toBe("-12.34");
		expect(money(0)).toBe("0.00");
		expect(money(null)).toBe("n/a");
		expect(signed(500000)).toBe("+500.00");
		expect(signed(-500000)).toBe("-500.00");
	});

	test("keeps the third decimal for currencies that have one", () => {
		expect(money(-395032)).toBe("-395.032");
	});

	test("prefers the amount YNAB formatted in the plan's own currency", () => {
		expect(money(123930, "$123.93")).toBe("$123.93");
		expect(money(-2990, "-€2,99")).toBe("-€2,99");
		expect(signed(4924340, "€4.924,34")).toBe("+€4.924,34");
		expect(money(0, null)).toBe("0.00");
		expect(money(0, "")).toBe("0.00");
	});
});

describe("month", () => {
	test("defaults to the current month", () => {
		expect(monthArg({})).toBe("current");
		expect(monthArg({ month: "current" })).toBe("current");
	});

	test("snaps any day in a month to the first, which is what YNAB indexes", () => {
		expect(monthArg({ month: "2026-08" })).toBe("2026-08-01");
		expect(monthArg({ month: "2026-08-15" })).toBe("2026-08-01");
	});

	test("rejects anything else rather than sending it upstream", () => {
		expect(() => monthArg({ month: "august" })).toThrow(/month must be/);
		expect(() => monthArg({ month: "2026" })).toThrow(/month must be/);
	});
});

describe("clearing a field", () => {
	test("separates saying nothing from asking for empty", () => {
		expect(clearable({}, "memo")).toBeUndefined();
		expect(clearable({ memo: "lunch" }, "memo")).toBe("lunch");
		expect(clearable({ memo: null }, "memo")).toBeNull();
		expect(clearable({ memo: "" }, "memo")).toBeNull();
		expect(clearable({ memo: "   " }, "memo")).toBeNull();
	});
});

describe("dates", () => {
	test("requires an ISO date", () => {
		expect(dateArg({ date: "2026-09-28" }, "date", true)).toBe("2026-09-28");
		expect(dateArg({}, "since_date")).toBeUndefined();
		expect(() => dateArg({ date: "09/28/2026" }, "date", true)).toThrow(
			/ISO date/,
		);
		expect(() => dateArg({}, "date", true)).toThrow(/date is required/);
	});
});
