import { describe, expect, test } from "bun:test";
import { computeChecksStatus, type SyncedCheck } from "./computeChecksStatus";

function check(
	conclusion: string | null,
	status = conclusion === null ? "in_progress" : "completed",
): SyncedCheck {
	return { name: `check-${conclusion ?? status}`, status, conclusion };
}

describe("computeChecksStatus", () => {
	test("returns none for an empty list", () => {
		expect(computeChecksStatus([])).toBe("none");
	});

	test("a cancelled check rolls up as failure, not success", () => {
		expect(computeChecksStatus([check("cancelled")])).toBe("failure");
		expect(computeChecksStatus([check("success"), check("cancelled")])).toBe(
			"failure",
		);
	});

	test("terminal non-passing conclusions roll up as failure", () => {
		expect(computeChecksStatus([check("failure")])).toBe("failure");
		expect(computeChecksStatus([check("timed_out")])).toBe("failure");
		expect(computeChecksStatus([check("action_required")])).toBe("failure");
		expect(computeChecksStatus([check("startup_failure")])).toBe("failure");
	});

	test("failure takes precedence over pending", () => {
		expect(computeChecksStatus([check(null), check("cancelled")])).toBe(
			"failure",
		);
	});

	test("pending wins when nothing failed", () => {
		expect(computeChecksStatus([check("success"), check(null)])).toBe(
			"pending",
		);
	});

	test("skipped and neutral checks fold into success", () => {
		expect(
			computeChecksStatus([
				check("success"),
				check("skipped"),
				check("neutral"),
			]),
		).toBe("success");
	});
});
