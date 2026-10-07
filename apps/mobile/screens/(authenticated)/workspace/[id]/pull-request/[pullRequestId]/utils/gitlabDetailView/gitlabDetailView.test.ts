import { expect, test } from "bun:test";
import { gitlabDetailView as view } from "./gitlabDetailView";

const detail = {
	provider: "gitlab",
	pullRequest: { number: 17, title: "Native", state: "open", mergedAt: null },
	checks: [
		{
			name: "CI",
			status: "COMPLETED",
			conclusion: "SUCCESS",
			isRequired: false,
			startedAt: null,
			completedAt: null,
			detailsUrl: "https://git.example/jobs/1",
		},
	],
	reviewers: [
		{ login: "reviewer", avatarUrl: null, isTeam: false, state: "REQUESTED" },
	],
};
test("native view retains genuine missing dates and assigned reviewers", () => {
	const result = view(detail);
	expect(result?.checks[0]).toEqual(detail.checks[0]);
	expect(result?.reviewers).toEqual(detail.reviewers);
	expect(result?.pullRequest.mergedAt).toBeNull();
	expect(result).not.toHaveProperty("mergeability");
});
test("native genuine dates convert and invalid stamps remain unavailable", () => {
	const result = view({
		...detail,
		pullRequest: { ...detail.pullRequest, mergedAt: "2026-10-04T00:00:00Z" },
		checks: [
			{
				...detail.checks[0],
				startedAt: "invalid",
				completedAt: "2026-10-04T00:00:00Z",
			},
		],
	});
	expect(result?.pullRequest.mergedAt).toEqual(
		new Date("2026-10-04T00:00:00Z"),
	);
	expect(result?.checks[0].startedAt).toBeNull();
	expect(result?.checks[0].completedAt).toEqual(
		new Date("2026-10-04T00:00:00Z"),
	);
});
test("native unproven GH team/review states cannot enter display", () => {
	expect(
		view({
			...detail,
			reviewers: [
				{ ...detail.reviewers[0], isTeam: true, state: "CHANGES_REQUESTED" },
			],
		}),
	).toBeNull();
});

test("native unsafe check browser targets are hidden", () => {
	for (const url of [
		"javascript:alert(1)",
		"http://git.example/jobs/1",
		"https://user:secret@git.example/jobs/1",
		"broken",
	]) {
		expect(
			view({ ...detail, checks: [{ ...detail.checks[0], detailsUrl: url }] })
				?.checks[0].detailsUrl,
		).toBeNull();
	}
});
test("native unknown check status and conclusions refuse view", () => {
	expect(
		view({ ...detail, checks: [{ ...detail.checks[0], status: "UNKNOWN" }] }),
	).toBeNull();
	expect(
		view({
			...detail,
			checks: [{ ...detail.checks[0], conclusion: "UNKNOWN" }],
		}),
	).toBeNull();
});
test("native canceled conclusion retains genuine ignored state", () => {
	expect(
		view({
			...detail,
			checks: [{ ...detail.checks[0], conclusion: "CANCELED" }],
		})?.checks[0].conclusion,
	).toBe("CANCELLED");
});
