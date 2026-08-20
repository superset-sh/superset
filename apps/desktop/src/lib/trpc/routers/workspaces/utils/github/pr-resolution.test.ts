import { describe, expect, test } from "bun:test";
import { computeChecksStatus } from "./pr-resolution";
import type { GHPRResponse } from "./types";

type CheckContext = NonNullable<GHPRResponse["statusCheckRollup"]>[number];

function state(value: CheckContext["state"]): CheckContext {
	return { state: value };
}

function conclusion(value: CheckContext["conclusion"]): CheckContext {
	return { conclusion: value };
}

describe("computeChecksStatus", () => {
	test("no rollup is none", () => {
		expect(computeChecksStatus(null)).toBe("none");
		expect(computeChecksStatus([])).toBe("none");
	});

	test("a cancelled check is a failure, not a success", () => {
		expect(computeChecksStatus([conclusion("CANCELLED")])).toBe("failure");
		expect(
			computeChecksStatus([state("SUCCESS"), conclusion("CANCELLED")]),
		).toBe("failure");
	});

	test("cancelled beats pending, matching the failure/pending precedence used elsewhere", () => {
		expect(
			computeChecksStatus([state("PENDING"), conclusion("CANCELLED")]),
		).toBe("failure");
	});

	test("failure beats pending", () => {
		expect(computeChecksStatus([state("PENDING"), state("FAILURE")])).toBe(
			"failure",
		);
	});

	test("pending beats success", () => {
		expect(computeChecksStatus([state("SUCCESS"), state("PENDING")])).toBe(
			"pending",
		);
	});

	test("all success is success", () => {
		expect(computeChecksStatus([state("SUCCESS"), state("SUCCESS")])).toBe(
			"success",
		);
	});
});
