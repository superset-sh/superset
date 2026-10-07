import { describe, expect, test } from "bun:test";
import { initI18n } from "@superset/i18n";
import {
	getPullRequestReviewFilterLabel,
	getPullRequestReviewFilterOptions,
	getPullRequestSearchSelection,
	normalizePullRequestReviewFilter,
} from "./pullRequestReviewFilter";

initI18n();

describe("pullRequestReviewFilter", () => {
	test("normalizes supported review filters", () => {
		expect(normalizePullRequestReviewFilter("approved")).toBe("approved");
		expect(normalizePullRequestReviewFilter("team-review-requested")).toBe(
			"team-review-requested",
		);
	});

	test("rejects unsupported filters and labels the default", () => {
		expect(normalizePullRequestReviewFilter("review:approved")).toBeNull();
		expect(normalizePullRequestReviewFilter(null)).toBeNull();
		expect(getPullRequestReviewFilterLabel(null)).toBe("All reviews");
		expect(getPullRequestReviewFilterLabel("changes-requested")).toBe(
			"Changes requested",
		);
	});
});

test("uses current-cycle labels and disables unproven GitLab rule/team filters", () => {
	const selection = getPullRequestSearchSelection(
		[{ projectId: "gl", provider: "gitlab", approvalRules: "unavailable" }],
		1,
		false,
	);
	expect(getPullRequestReviewFilterLabel("reviewed-by-me", selection)).toBe(
		"Reviewed by you in the current review cycle",
	);
	const options = getPullRequestReviewFilterOptions(selection);
	expect(
		options.some((option) => option.value === "team-review-requested"),
	).toBe(false);
	expect(options.find((option) => option.value === "approved")?.disabled).toBe(
		true,
	);
	expect(options.find((option) => option.value === "required")?.disabled).toBe(
		true,
	);
	expect(
		options.find((option) => option.value === "reviewed-by-me")?.disabled,
	).toBe(false);
});
test("keeps all original GitHub choices and exposes mixed incompatibility rather than removing GH controls", () => {
	const gh = getPullRequestSearchSelection(
		[{ projectId: "gh", provider: "github", approvalRules: "available" }],
		1,
		false,
	);
	expect(getPullRequestReviewFilterOptions(gh)).toHaveLength(8);
	expect(
		getPullRequestReviewFilterOptions(gh).every((option) => !option.disabled),
	).toBe(true);
	expect(getPullRequestReviewFilterLabel("reviewed-by-me", gh)).toBe(
		"Reviewed by you",
	);
	const mixed = getPullRequestSearchSelection(
		[
			{ projectId: "gh", provider: "github", approvalRules: "available" },
			{ projectId: "gl", provider: "gitlab", approvalRules: "available" },
		],
		2,
		false,
	);
	expect(getPullRequestReviewFilterOptions(mixed)).toHaveLength(8);
	expect(
		getPullRequestReviewFilterOptions(mixed).find(
			(option) => option.value === "team-review-requested",
		)?.disabled,
	).toBe(true);
});
test("keeps pending, failed, missing and unavailable rule facts distinct", () => {
	expect(getPullRequestSearchSelection([], 1, true)).toMatchObject({
		mode: "unknown",
		ready: false,
	});
	const unknown = getPullRequestSearchSelection(
		[
			{
				projectId: "gl",
				provider: "gitlab",
				approvalRules: "unknown",
				error: { code: "UNAUTHORIZED", message: "Authenticate native host" },
			},
		],
		1,
		false,
	);
	expect(unknown).toMatchObject({
		mode: "gitlab",
		ready: true,
		approvalRules: false,
		error: "Authenticate native host",
	});
	expect(
		getPullRequestSearchSelection(
			[{ projectId: "gl", provider: "gitlab", approvalRules: "available" }],
			2,
			false,
		),
	).toMatchObject({ mode: "unknown", ready: false });
});
