import { describe, expect, it } from "bun:test";
import { initI18n } from "@superset/i18n";
import type { PullRequestCheck } from "../../../../../../utils/pullRequest/types";
import { checksFilterState } from "./checksFilter";

initI18n();

function check(
	name: string,
	status: PullRequestCheck["status"],
	conclusion: PullRequestCheck["conclusion"],
): PullRequestCheck {
	return {
		name,
		status,
		conclusion,
		isRequired: false,
		startedAt: null,
		completedAt: null,
		detailsUrl: null,
	};
}

const passed = (name: string) => check(name, "COMPLETED", "SUCCESS");
const failed = (name: string) => check(name, "COMPLETED", "FAILURE");
const running = (name: string) => check(name, "IN_PROGRESS", null);
const skipped = (name: string) => check(name, "COMPLETED", "SKIPPED");
const needsAction = (name: string) =>
	check(name, "COMPLETED", "ACTION_REQUIRED");

const labels = (checks: PullRequestCheck[]) =>
	checksFilterState(checks, "all").options.map((option) => option.label);

describe("checksFilterState options", () => {
	it("drops Failed when nothing failed", () => {
		expect(labels([passed("CI / Lint"), passed("CI / Test")])).toEqual([
			"All",
			"Passed",
		]);
	});

	it("keeps Failed when something failed", () => {
		expect(labels([passed("CI / Lint"), failed("CI / Test")])).toEqual([
			"All",
			"Failed",
			"Passed",
		]);
	});

	it("counts a needs-action check as failed", () => {
		const state = checksFilterState([needsAction("Deploy / Approve")], "all");
		expect(state.options.map((option) => option.label)).toEqual([
			"All",
			"Failed",
		]);
		expect(state.counts.failed).toBe(1);
	});

	it("offers only All when there are no checks at all", () => {
		expect(labels([])).toEqual(["All"]);
	});

	it("offers every populated segment, in run order", () => {
		expect(
			labels([
				running("CI / Build"),
				failed("CI / Test"),
				passed("CI / Lint"),
				skipped("Deploy / Docs"),
			]),
		).toEqual(["All", "Running", "Failed", "Passed", "Skipped"]);
	});

	it("counts every segment", () => {
		const { counts } = checksFilterState(
			[
				running("CI / Build"),
				failed("CI / Test"),
				needsAction("Deploy / Approve"),
				passed("CI / Lint"),
				skipped("Deploy / Docs"),
			],
			"all",
		);
		expect(counts).toEqual({
			all: 5,
			running: 1,
			failed: 2,
			passed: 1,
			skipped: 1,
		});
	});
});

describe("checksFilterState active filter", () => {
	it("keeps a filter whose segment still exists", () => {
		const state = checksFilterState(
			[failed("CI / Test"), passed("CI / Lint")],
			"failed",
		);
		expect(state.filter).toBe("failed");
		expect(state.groups.map((group) => group.filter)).toEqual(["failed"]);
	});

	it("falls back to All when the selected segment disappears", () => {
		const state = checksFilterState([passed("CI / Test")], "failed");
		expect(state.filter).toBe("all");
		expect(state.options.map((option) => option.value)).toEqual([
			"all",
			"passed",
		]);
		expect(state.groups.map((group) => group.filter)).toEqual(["passed"]);
	});

	it("shows every non-empty group under All", () => {
		const state = checksFilterState(
			[running("CI / Build"), failed("CI / Test"), passed("CI / Lint")],
			"all",
		);
		expect(state.groups.map((group) => group.filter)).toEqual([
			"running",
			"failed",
			"passed",
		]);
	});
});
