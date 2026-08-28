import { describe, expect, test } from "bun:test";
import { relativeTime } from "./relativeTime";

const threeDaysAgo = () => new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

describe("relativeTime", () => {
	test("formats a Date", () => {
		expect(relativeTime(threeDaysAgo())).toBe("3 days ago");
	});

	test("formats an ISO string without coercing it first", () => {
		expect(relativeTime(threeDaysAgo().toISOString())).toBe("3 days ago");
	});

	test("formats an epoch number", () => {
		expect(relativeTime(threeDaysAgo().getTime())).toBe("3 days ago");
	});

	test("returns empty rather than throwing on an unparseable string", () => {
		expect(relativeTime("garbage")).toBe("");
	});

	test("returns empty rather than throwing on an invalid Date", () => {
		expect(relativeTime(new Date("garbage"))).toBe("");
	});
});
