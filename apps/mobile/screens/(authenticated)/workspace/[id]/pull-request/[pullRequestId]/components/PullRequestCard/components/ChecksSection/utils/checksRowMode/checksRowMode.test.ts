import { describe, expect, test } from "bun:test";
import { tallyChecks } from "../../../../../../../../utils/pullRequest/checks";
import type { PullRequestCheck } from "../../../../../../../../utils/pullRequest/types";
import { checksRowMode } from "./checksRowMode";

function check(overrides: Partial<PullRequestCheck> = {}): PullRequestCheck {
	return {
		name: "CI / Check",
		status: "COMPLETED",
		conclusion: "SUCCESS",
		isRequired: false,
		startedAt: null,
		completedAt: null,
		detailsUrl: null,
		...overrides,
	};
}

const failing = () => check({ conclusion: "FAILURE" });
const running = () => check({ status: "IN_PROGRESS", conclusion: null });

describe("checksRowMode", () => {
	test("a failure is listed even while other checks still run", () => {
		const tally = tallyChecks([
			...Array.from({ length: 16 }, () => check()),
			failing(),
			running(),
			running(),
		]);
		expect(checksRowMode(tally)).toBe("failures");
		expect(tally.failed).toBe(1);
		expect(tally.running).toBe(2);
	});

	test("action required counts as a failure to list", () => {
		const tally = tallyChecks([
			check({ conclusion: "ACTION_REQUIRED" }),
			running(),
		]);
		expect(checksRowMode(tally)).toBe("failures");
	});

	test("running without failures is the ring", () => {
		expect(checksRowMode(tallyChecks([check(), running()]))).toBe("ring");
	});

	test("all passed settles", () => {
		expect(checksRowMode(tallyChecks([check(), check()]))).toBe("settled");
	});

	test("skipped-only settles rather than spins", () => {
		expect(checksRowMode(tallyChecks([check({ conclusion: "SKIPPED" })]))).toBe(
			"settled",
		);
	});
});
