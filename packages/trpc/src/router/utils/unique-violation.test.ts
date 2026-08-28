import { describe, expect, test } from "bun:test";
import { isUniqueViolation } from "./unique-violation";

const CONSTRAINT = "leaderboard_participants_handle_unique";

describe("isUniqueViolation", () => {
	test("matches a bare driver error", () => {
		expect(
			isUniqueViolation({ code: "23505", constraint: CONSTRAINT }, CONSTRAINT),
		).toBe(true);
	});

	test("matches through a drizzle wrapper", () => {
		const wrapped = new Error("query failed", {
			cause: { code: "23505", constraint: CONSTRAINT },
		});
		expect(isUniqueViolation(wrapped, CONSTRAINT)).toBe(true);
	});

	test("ignores a different constraint", () => {
		expect(
			isUniqueViolation(
				{ code: "23505", constraint: "other_unique" },
				CONSTRAINT,
			),
		).toBe(false);
	});

	test("ignores a different error code", () => {
		expect(
			isUniqueViolation({ code: "23503", constraint: CONSTRAINT }, CONSTRAINT),
		).toBe(false);
	});

	test("terminates on a self-referential cause chain", () => {
		const looped: { cause?: unknown } = {};
		looped.cause = looped;
		expect(isUniqueViolation(looped, CONSTRAINT)).toBe(false);
	});

	test("handles null and primitives", () => {
		expect(isUniqueViolation(null, CONSTRAINT)).toBe(false);
		expect(isUniqueViolation("boom", CONSTRAINT)).toBe(false);
	});
});
