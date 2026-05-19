import { describe, expect, test } from "bun:test";
import { decideImportOutcome } from "./importOutcome";

describe("decideImportOutcome", () => {
	test("no selections — finish silently", () => {
		expect(
			decideImportOutcome({ totalAttempted: 0, totalImported: 0 }),
		).toEqual({ action: "finish", successMessage: null });
	});

	test("all succeeded — finish with success toast", () => {
		expect(
			decideImportOutcome({ totalAttempted: 3, totalImported: 3 }),
		).toEqual({ action: "finish", successMessage: "Imported 3 workspaces" });
	});

	test("singular toast when exactly one imported", () => {
		expect(
			decideImportOutcome({ totalAttempted: 1, totalImported: 1 }),
		).toEqual({ action: "finish", successMessage: "Imported 1 workspace" });
	});

	test("all failed — stay so user can retry", () => {
		expect(
			decideImportOutcome({ totalAttempted: 4, totalImported: 0 }),
		).toEqual({ action: "stay", successMessage: null });
	});

	// Reproduces #4266: when some imports succeeded and some failed, the
	// previous inline logic in `handleImportSelected` only stayed on the
	// page when *every* import failed (`totalImported === 0`). On partial
	// failure it called `onFinish()` and yanked the user into the dashboard,
	// dropping the failed selections with no retry path. The user picked
	// those worktrees deliberately — silently abandoning them when most
	// succeeded loses work.
	test("partial failure — stay so user can retry the failures", () => {
		expect(
			decideImportOutcome({ totalAttempted: 5, totalImported: 4 }),
		).toEqual({ action: "stay", successMessage: null });
	});

	test("partial failure with single success — also stay", () => {
		expect(
			decideImportOutcome({ totalAttempted: 5, totalImported: 1 }),
		).toEqual({ action: "stay", successMessage: null });
	});
});
