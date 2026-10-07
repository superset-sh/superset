import { describe, expect, it } from "bun:test";
import type { StatusCheck } from "../types";
import {
	type GitLabCommitStatus,
	type GitLabMergeRequest,
	type GitLabPipelineJob,
	mapCommitStatusesToChecks,
	mapJobsToChecks,
	mapMergeRequestToNode,
	normalizeGitLabChecks,
} from "./gitlab-mappers";

const REPO = { owner: "acme", name: "widget" };

function makeMr(
	overrides: Partial<GitLabMergeRequest> = {},
): GitLabMergeRequest {
	return {
		iid: 42,
		title: "My MR",
		web_url: "https://gitlab.example.com/acme/widget/-/merge_requests/42",
		state: "opened",
		draft: false,
		sha: "abc123",
		source_branch: "feature/foo",
		target_branch: "main",
		source_project_id: 1,
		target_project_id: 1,
		detailed_merge_status: "mergeable",
		blocking_discussions_resolved: true,
		has_conflicts: false,
		author: { username: "alice" },
		created_at: "2024-01-01T00:00:00Z",
		updated_at: "2024-01-02T00:00:00Z",
		merged_at: null,
		...overrides,
	};
}

describe("mapMergeRequestToNode", () => {
	it("maps opened MR to OPEN state", () => {
		const node = mapMergeRequestToNode(makeMr({ state: "opened" }), REPO);
		expect(node.state).toBe("OPEN");
	});

	it("maps locked MR to OPEN state", () => {
		const node = mapMergeRequestToNode(makeMr({ state: "locked" }), REPO);
		expect(node.state).toBe("OPEN");
	});

	it("maps closed MR to CLOSED state", () => {
		const node = mapMergeRequestToNode(makeMr({ state: "closed" }), REPO);
		expect(node.state).toBe("CLOSED");
	});

	it("maps merged MR to MERGED state", () => {
		const node = mapMergeRequestToNode(makeMr({ state: "merged" }), REPO);
		expect(node.state).toBe("MERGED");
	});

	it("maps basic fields correctly", () => {
		const mr = makeMr();
		const node = mapMergeRequestToNode(mr, REPO);
		expect(node.number).toBe(42);
		expect(node.title).toBe("My MR");
		expect(node.url).toBe(
			"https://gitlab.example.com/acme/widget/-/merge_requests/42",
		);
		expect(node.isDraft).toBe(false);
		expect(node.headRefName).toBe("feature/foo");
		expect(node.headRefOid).toBe("abc123");
		expect(node.updatedAt).toBe("2024-01-02T00:00:00Z");
	});

	it("sets isCrossRepository false for same-project MR", () => {
		const node = mapMergeRequestToNode(
			makeMr({ source_project_id: 1, target_project_id: 1 }),
			REPO,
		);
		expect(node.isCrossRepository).toBe(false);
	});

	it("sets headRepositoryOwner and headRepository for non-cross-repo MR", () => {
		const node = mapMergeRequestToNode(makeMr(), REPO);
		expect(node.headRepositoryOwner).toEqual({ login: "acme" });
		expect(node.headRepository).toEqual({ name: "widget" });
	});

	it("sets isCrossRepository true for different-project MR", () => {
		const node = mapMergeRequestToNode(
			makeMr({ source_project_id: 2, target_project_id: 1 }),
			REPO,
		);
		expect(node.isCrossRepository).toBe(true);
	});

	it("sets headRepositoryOwner and headRepository to null for cross-repo MR", () => {
		const node = mapMergeRequestToNode(
			makeMr({ source_project_id: 2, target_project_id: 1 }),
			REPO,
		);
		expect(node.headRepositoryOwner).toBeNull();
		expect(node.headRepository).toBeNull();
	});

	it("maps draft flag", () => {
		const node = mapMergeRequestToNode(makeMr({ draft: true }), REPO);
		expect(node.isDraft).toBe(true);
	});
});

function makeJob(
	overrides: Partial<GitLabPipelineJob> = {},
): GitLabPipelineJob {
	return {
		id: 1,
		name: "build",
		status: "success",
		stage: "build",
		web_url: "https://gitlab.example.com/acme/widget/-/jobs/1",
		started_at: "2024-01-02T00:00:00Z",
		finished_at: "2024-01-02T00:01:00Z",
		allow_failure: false,
		...overrides,
	};
}

describe("mapJobsToChecks", () => {
	it("maps jobs to neutral CheckRun nodes (kind: check)", () => {
		const nodes = mapJobsToChecks([makeJob()]);
		expect(nodes[0]?.kind).toBe("check");
	});

	it("maps job name to node.name", () => {
		const nodes = mapJobsToChecks([makeJob({ name: "lint" })]);
		const node = nodes[0];
		if (node?.kind !== "check") throw new Error("Expected CheckRun");
		expect(node.name).toBe("lint");
	});

	it("maps success job → COMPLETED/SUCCESS (normalizeGitLabChecks: success)", () => {
		const checks = normalizeGitLabChecks(
			mapJobsToChecks([makeJob({ status: "success" })]),
		);
		expect(checks[0]?.status).toBe("success");
	});

	it("maps failed job → COMPLETED/FAILURE (normalizeGitLabChecks: failure)", () => {
		const checks = normalizeGitLabChecks(
			mapJobsToChecks([makeJob({ status: "failed" })]),
		);
		expect(checks[0]?.status).toBe("failure");
	});

	it("maps canceled job → COMPLETED/CANCELLED (normalizeGitLabChecks: cancelled)", () => {
		const checks = normalizeGitLabChecks(
			mapJobsToChecks([makeJob({ status: "canceled" })]),
		);
		expect(checks[0]?.status).toBe("cancelled");
	});

	it("maps running job → IN_PROGRESS status (normalizeGitLabChecks: pending)", () => {
		const checks = normalizeGitLabChecks(
			mapJobsToChecks([makeJob({ status: "running" })]),
		);
		expect(checks[0]?.status).toBe("pending");
	});

	it("maps pending job → QUEUED status (normalizeGitLabChecks: pending)", () => {
		const checks = normalizeGitLabChecks(
			mapJobsToChecks([makeJob({ status: "pending" })]),
		);
		expect(checks[0]?.status).toBe("pending");
	});

	it("maps created job → QUEUED status (normalizeGitLabChecks: pending)", () => {
		const checks = normalizeGitLabChecks(
			mapJobsToChecks([makeJob({ status: "created" })]),
		);
		expect(checks[0]?.status).toBe("pending");
	});

	it("maps skipped job → COMPLETED/SKIPPED (normalizeGitLabChecks: skipped)", () => {
		const checks = normalizeGitLabChecks(
			mapJobsToChecks([makeJob({ status: "skipped" })]),
		);
		expect(checks[0]?.status).toBe("skipped");
	});

	it("maps manual job → QUEUED status (normalizeGitLabChecks: pending)", () => {
		const checks = normalizeGitLabChecks(
			mapJobsToChecks([makeJob({ status: "manual" })]),
		);
		expect(checks[0]?.status).toBe("pending");
	});

	it("maps detailsUrl from job web_url", () => {
		const nodes = mapJobsToChecks([
			makeJob({ web_url: "https://gitlab.example.com/-/jobs/99" }),
		]);
		const node = nodes[0];
		if (node?.kind !== "check") throw new Error("Expected CheckRun");
		expect(node.detailsUrl).toBe("https://gitlab.example.com/-/jobs/99");
	});

	it("handles an empty jobs array", () => {
		expect(mapJobsToChecks([])).toEqual([]);
	});

	it("mixed jobs array produces expected statuses after normalizeGitLabChecks", () => {
		const jobs = [
			makeJob({ name: "build", status: "success" }),
			makeJob({ name: "test", status: "failed" }),
			makeJob({ name: "deploy", status: "running" }),
		];
		const checks = normalizeGitLabChecks(mapJobsToChecks(jobs));
		const byName = Object.fromEntries(checks.map((c) => [c.name, c.status]));
		expect(byName.build).toBe("success");
		expect(byName.test).toBe("failure");
		expect(byName.deploy).toBe("pending");
	});
});

function makeStatus(
	overrides: Partial<GitLabCommitStatus> = {},
): GitLabCommitStatus {
	return {
		id: 1,
		name: "ci/test",
		status: "success",
		target_url: "https://ci.example.com/build/1",
		description: "Tests passed",
		finished_at: "2024-01-02T00:01:00Z",
		allow_failure: false,
		...overrides,
	};
}

describe("mapCommitStatusesToChecks", () => {
	it("maps commit statuses to neutral StatusCheck nodes (kind: status)", () => {
		const nodes = mapCommitStatusesToChecks([makeStatus()]);
		expect(nodes[0]?.kind).toBe("status");
	});

	it("maps status name to node.context", () => {
		const nodes = mapCommitStatusesToChecks([makeStatus({ name: "coverage" })]);
		const node = nodes[0];
		if (node?.kind !== "status") throw new Error("Expected StatusContext");
		expect(node.context).toBe("coverage");
	});

	it("maps success status → SUCCESS state (normalizeGitLabChecks: success)", () => {
		const checks = normalizeGitLabChecks(
			mapCommitStatusesToChecks([makeStatus({ status: "success" })]),
		);
		expect(checks[0]?.status).toBe("success");
	});

	it("maps failed status → FAILURE state (normalizeGitLabChecks: failure)", () => {
		const checks = normalizeGitLabChecks(
			mapCommitStatusesToChecks([makeStatus({ status: "failed" })]),
		);
		expect(checks[0]?.status).toBe("failure");
	});

	it("maps pending status → PENDING state (normalizeGitLabChecks: pending)", () => {
		const checks = normalizeGitLabChecks(
			mapCommitStatusesToChecks([makeStatus({ status: "pending" })]),
		);
		expect(checks[0]?.status).toBe("pending");
	});

	it("maps running status → PENDING state (normalizeGitLabChecks: pending)", () => {
		const checks = normalizeGitLabChecks(
			mapCommitStatusesToChecks([makeStatus({ status: "running" })]),
		);
		expect(checks[0]?.status).toBe("pending");
	});

	it("maps target_url to node.targetUrl", () => {
		const nodes = mapCommitStatusesToChecks([
			makeStatus({ target_url: "https://ci.example.com/1" }),
		]);
		const node = nodes[0];
		if (node?.kind !== "status") throw new Error("Expected StatusContext");
		expect(node.targetUrl).toBe("https://ci.example.com/1");
	});

	it("handles null target_url", () => {
		const nodes = mapCommitStatusesToChecks([makeStatus({ target_url: null })]);
		const node = nodes[0];
		if (node?.kind !== "status") throw new Error("Expected StatusContext");
		expect(node.targetUrl).toBeNull();
	});

	it("handles an empty statuses array", () => {
		expect(mapCommitStatusesToChecks([])).toEqual([]);
	});
});

describe("mapJobsToChecks — allow_failure", () => {
	const job = (over: Partial<GitLabPipelineJob>): GitLabPipelineJob =>
		({
			id: 1,
			name: "lint",
			status: "failed",
			web_url: "https://gitlab.example.com/j/1",
			started_at: null,
			finished_at: null,
			stage: "test",
			allow_failure: false,
			...over,
		}) as GitLabPipelineJob;

	it("a failed job that GitLab allows to fail is NEUTRAL, not FAILURE", () => {
		const [check] = mapJobsToChecks([job({ allow_failure: true })]);
		expect(check?.conclusion).toBe("NEUTRAL");
	});

	it("a genuinely failed job is still FAILURE", () => {
		const [check] = mapJobsToChecks([job({ allow_failure: false })]);
		expect(check?.conclusion).toBe("FAILURE");
	});

	it("allow_failure does not alter a successful job", () => {
		const [check] = mapJobsToChecks([
			job({ status: "success", allow_failure: true }),
		]);
		expect(check?.conclusion).toBe("SUCCESS");
	});
});

describe("normalizeGitLabChecks", () => {
	it("uses the newest timestamp when repeated job names occur", () => {
		const checks = normalizeGitLabChecks(
			mapJobsToChecks([
				makeJob({ status: "failed", finished_at: "2026-01-01T00:00:00Z" }),
				makeJob({ status: "success", finished_at: "2026-01-02T00:00:00Z" }),
			]),
		);
		expect(checks).toEqual([
			{
				name: "build",
				status: "success",
				url: "https://gitlab.example.com/acme/widget/-/jobs/1",
				startedAt: "2024-01-02T00:00:00Z",
				completedAt: "2026-01-02T00:00:00Z",
			},
		]);
	});

	it("keeps a failed optional commit status nonblocking", () => {
		const checks = normalizeGitLabChecks(
			mapCommitStatusesToChecks([
				makeStatus({ status: "failed", allow_failure: true }),
			]),
		);
		expect(checks[0]?.status).toBe("skipped");
	});
});

describe("GitLab native CI state and recency", () => {
	it.each([
		true,
		false,
	])("optional manual policy remains native with allow_failure=%s", (allow_failure) => {
		const expected = allow_failure ? "skipped" : "pending";
		expect(
			normalizeGitLabChecks(
				mapJobsToChecks([makeJob({ status: "manual", allow_failure })]),
			)[0]?.status,
		).toBe(expected);
		expect(
			normalizeGitLabChecks(
				mapCommitStatusesToChecks([
					makeStatus({ status: "manual", allow_failure }),
				]),
			)[0]?.status,
		).toBe(expected);
	});

	it.each([
		["skipped", "skipped"],
		["canceled", "cancelled"],
	] as const)("commit %s preserves its terminal outcome", (status, expected) => {
		expect(
			normalizeGitLabChecks(
				mapCommitStatusesToChecks([makeStatus({ status })]),
			)[0]?.status,
		).toBe(expected);
	});

	it("queued jobs and statuses preserve creation and native run identifiers", () => {
		const job = {
			...makeJob({
				id: 20,
				status: "pending",
				started_at: null,
				finished_at: null,
			}),
			created_at: "2026-10-04T10:00:00Z",
			pipeline: { id: 2 },
		};
		const status = {
			...makeStatus({ id: 20, status: "pending", finished_at: null }),
			created_at: job.created_at,
			pipeline_id: 2,
		};
		expect(mapJobsToChecks([job])[0]).toMatchObject({
			databaseId: 20,
			createdAt: job.created_at,
			runGroupId: 2,
		});
		expect(mapCommitStatusesToChecks([status])[0]).toMatchObject({
			databaseId: 20,
			createdAt: job.created_at,
			runGroupId: 2,
		});
	});

	it("creation time orders queued statuses when run identifiers are absent", () => {
		const checks = normalizeGitLabChecks([
			{
				kind: "status",
				context: "build",
				state: "SUCCESS",
				targetUrl: null,
				createdAt: "2026-10-04T09:00:00Z",
				completedAt: "2026-10-04T11:00:00Z",
			},
			{
				kind: "status",
				context: "build",
				state: "PENDING",
				targetUrl: null,
				createdAt: "2026-10-04T10:00:00Z",
				completedAt: null,
			},
		]);
		expect(checks[0]?.status).toBe("pending");
	});

	it("a fresh external failure with no pipeline ID remains visible", () => {
		const checks = normalizeGitLabChecks([
			...mapJobsToChecks([
				{
					...makeJob({
						id: 20,
						status: "pending",
						started_at: null,
						finished_at: null,
					}),
					pipeline: { id: 2 },
					created_at: "2026-10-04T10:00:00Z",
				},
			]),
			...mapCommitStatusesToChecks([
				{
					...makeStatus({ id: 30, status: "failed" }),
					name: "build",
					created_at: "2026-10-04T10:30:00Z",
				},
			]),
		]);
		expect(checks[0]?.status).toBe("failure");
	});

	it("a queued retry replaces an older completion without start or finish timestamps", () => {
		const checks = normalizeGitLabChecks(
			mapJobsToChecks([
				{ ...makeJob({ id: 21, status: "success" }), pipeline: { id: 2 } },
				{
					...makeJob({
						id: 22,
						status: "pending",
						started_at: null,
						finished_at: null,
					}),
					pipeline: { id: 2 },
				},
			]),
		);
		expect(checks[0]?.status).toBe("pending");
	});

	it("the new pipeline wins even when an old pipeline completes later", () => {
		const checks = normalizeGitLabChecks([
			...mapJobsToChecks([
				{
					...makeJob({
						id: 20,
						status: "pending",
						started_at: null,
						finished_at: null,
					}),
					created_at: "2026-10-04T10:00:00Z",
					pipeline: { id: 2 },
				},
			]),
			...mapCommitStatusesToChecks([
				{
					...makeStatus({
						id: 30,
						status: "success",
						finished_at: "2026-10-04T11:00:00Z",
					}),
					name: "build",
					created_at: "2026-10-04T09:00:00Z",
					pipeline_id: 1,
				},
			]),
		]);
		expect(checks[0]?.status).toBe("pending");
	});
});

describe("GitLab check selection with mixed metadata", () => {
	const orders = [
		[0, 1, 2],
		[0, 2, 1],
		[1, 0, 2],
		[1, 2, 0],
		[2, 0, 1],
		[2, 1, 0],
	];

	it.each(
		orders,
	)("keeps the fresh external failure for pipeline order %i/%i/%i", (...order) => {
		const statuses = [
			makeStatus({
				id: 20,
				name: "build",
				pipeline_id: 2,
				status: "pending",
				created_at: "2026-10-04T10:00:00Z",
				finished_at: null,
			}),
			makeStatus({
				id: 25,
				name: "build",
				status: "failed",
				created_at: "2026-10-04T10:30:00Z",
				finished_at: "2026-10-04T10:31:00Z",
			}),
			makeStatus({
				id: 30,
				name: "build",
				pipeline_id: 1,
				status: "success",
				created_at: "2026-10-04T09:00:00Z",
				finished_at: "2026-10-04T11:00:00Z",
			}),
		];
		expect(
			normalizeGitLabChecks(
				mapCommitStatusesToChecks(
					order.flatMap((index) => statuses[index] ?? []),
				),
			),
		).toEqual([
			{
				name: "build",
				status: "failure",
				url: "https://ci.example.com/build/1",
			},
		]);
	});

	it.each(
		orders,
	)("keeps the latest ID-less failure for native ID order %i/%i/%i", (...order) => {
		const nodes: StatusCheck[] = [
			{
				kind: "status",
				context: "build",
				databaseId: 20,
				state: "PENDING",
				createdAt: "2026-10-04T10:00:00Z",
				completedAt: null,
				targetUrl: null,
			},
			{
				kind: "status",
				context: "build",
				state: "FAILURE",
				createdAt: "2026-10-04T10:30:00Z",
				completedAt: "2026-10-04T10:31:00Z",
				targetUrl: null,
			},
			{
				kind: "status",
				context: "build",
				databaseId: 10,
				state: "SUCCESS",
				createdAt: "2026-10-04T11:00:00Z",
				completedAt: "2026-10-04T11:01:00Z",
				targetUrl: null,
			},
		];
		expect(
			normalizeGitLabChecks(order.map((index) => nodes[index] ?? null)),
		).toEqual([{ name: "build", status: "failure", url: null }]);
	});

	it.each([
		false,
		true,
	])("same-record completion advances its queued mirror with reversed=%s", (reverse) => {
		const nodes = [
			...mapJobsToChecks(
				[
					makeJob({
						id: 20,
						status: "pending",
						created_at: "2026-10-04T10:00:00Z",
						started_at: null,
						finished_at: null,
					}),
				],
				2,
			),
			...mapCommitStatusesToChecks([
				makeStatus({
					id: 20,
					name: "build",
					pipeline_id: 2,
					status: "success",
					created_at: "2026-10-04T09:00:00Z",
					finished_at: "2026-10-04T10:31:00Z",
				}),
			]),
		];
		expect(
			normalizeGitLabChecks(reverse ? nodes.reverse() : nodes)[0]?.status,
		).toBe("success");
	});

	it.each([
		"FAILURE",
		"CANCELLED",
		"PENDING",
	])("same-record %s wins an equally advanced success with contradictory creation metadata", (state) => {
		const nodes: StatusCheck[] = [
			{
				kind: "status",
				context: "build",
				databaseId: 20,
				state,
				createdAt: "2026-10-04T09:00:00Z",
				completedAt: "2026-10-04T10:31:00Z",
				targetUrl: "https://ci.example.com/a",
			},
			{
				kind: "status",
				context: "build",
				databaseId: 20,
				state: "SUCCESS",
				createdAt: "2026-10-04T10:00:00Z",
				completedAt: "2026-10-04T10:31:00Z",
				targetUrl: "https://ci.example.com/b",
			},
		];
		const expected =
			state === "FAILURE"
				? "failure"
				: state === "CANCELLED"
					? "cancelled"
					: "pending";
		for (const order of [nodes, [...nodes].reverse()]) {
			expect(normalizeGitLabChecks(order)).toEqual([
				{ name: "build", status: expected, url: "https://ci.example.com/a" },
			]);
		}
	});

	it("same-record start advances a queued mirror despite creation metadata", () => {
		const nodes = mapJobsToChecks([
			makeJob({
				id: 20,
				status: "pending",
				created_at: "2026-10-04T10:00:00Z",
				started_at: null,
				finished_at: null,
				web_url: "https://ci.example.com/a",
			}),
			makeJob({
				id: 20,
				status: "running",
				created_at: "2026-10-04T09:00:00Z",
				started_at: "2026-10-04T10:01:00Z",
				finished_at: null,
				web_url: "https://ci.example.com/z",
			}),
		]);
		for (const order of [nodes, [...nodes].reverse()]) {
			expect(normalizeGitLabChecks(order)).toEqual([
				{
					name: "build",
					status: "pending",
					url: "https://ci.example.com/z",
					startedAt: "2026-10-04T10:01:00Z",
					completedAt: null,
				},
			]);
		}
	});

	it("missing and empty URLs break equally recent ties deterministically", () => {
		const nodes: StatusCheck[] = [
			{
				kind: "status",
				context: "build",
				state: "SUCCESS",
				createdAt: null,
				targetUrl: null,
			},
			{
				kind: "status",
				context: "build",
				state: "SUCCESS",
				createdAt: null,
				targetUrl: "",
			},
		];
		for (const order of [nodes, [...nodes].reverse()]) {
			expect(normalizeGitLabChecks(order)).toEqual([
				{ name: "build", status: "success", url: "" },
			]);
		}
	});

	it("unknown run ties choose a conservative outcome and stable URL", () => {
		const nodes: StatusCheck[] = [
			{
				kind: "status",
				context: "build",
				state: "SUCCESS",
				createdAt: null,
				targetUrl: "https://ci.example.com/success",
			},
			{
				kind: "status",
				context: "build",
				state: "FAILURE",
				createdAt: null,
				targetUrl: "https://ci.example.com/z",
			},
			{
				kind: "status",
				context: "build",
				state: "FAILURE",
				createdAt: null,
				targetUrl: "https://ci.example.com/a",
			},
		];
		for (const order of orders) {
			expect(
				normalizeGitLabChecks(order.map((index) => nodes[index] ?? null)),
			).toEqual([
				{ name: "build", status: "failure", url: "https://ci.example.com/a" },
			]);
		}
	});
});

describe("selected native job timing", () => {
	it("retains actual newest job raw timestamps and offset precision", () => {
		const old = makeJob({
			id: 10,
			started_at: "2026-10-04T10:00:00Z",
			finished_at: "2026-10-04T10:01:00Z",
		});
		const current = makeJob({
			id: 11,
			started_at: "2026-10-04T12:01:00.123+02:00",
			finished_at: "2026-10-04T12:02:00.456+02:00",
		});
		for (const jobs of [
			[old, current],
			[current, old],
		])
			expect(normalizeGitLabChecks(mapJobsToChecks(jobs))[0]).toMatchObject({
				status: "success",
				startedAt: current.started_at,
				completedAt: current.finished_at,
			});
	});
	it("queued new retry has no borrowed old completion timestamps", () => {
		const old = makeJob({ id: 10, status: "success" });
		const current = makeJob({
			id: 11,
			status: "pending",
			started_at: null,
			finished_at: null,
		});
		for (const jobs of [
			[old, current],
			[current, old],
		])
			expect(normalizeGitLabChecks(mapJobsToChecks(jobs))[0]).toMatchObject({
				status: "pending",
				startedAt: null,
				completedAt: null,
			});
	});
	it("same-record running mirror carries its actual selected start in both orders", () => {
		const queued = makeJob({
			id: 20,
			status: "pending",
			started_at: null,
			finished_at: null,
			created_at: "2026-10-04T10:00:00Z",
		});
		const running = makeJob({
			id: 20,
			status: "running",
			started_at: "2026-10-04T10:01:00Z",
			finished_at: null,
			created_at: "2026-10-04T09:00:00Z",
		});
		for (const jobs of [
			[queued, running],
			[running, queued],
		])
			expect(normalizeGitLabChecks(mapJobsToChecks(jobs))[0]).toMatchObject({
				status: "pending",
				startedAt: running.started_at,
				completedAt: null,
			});
	});
	it("deterministic outcome tie keeps timestamps from the winning failure only", () => {
		const failure = makeJob({
			id: 20,
			status: "failed",
			started_at: "2026-10-04T10:01:00Z",
			finished_at: "2026-10-04T10:03:00Z",
			web_url: "https://ci.example/a",
		});
		const success = makeJob({
			id: 20,
			status: "success",
			started_at: "2026-10-04T10:02:00Z",
			finished_at: failure.finished_at,
			web_url: "https://ci.example/z",
		});
		for (const jobs of [
			[failure, success],
			[success, failure],
		])
			expect(normalizeGitLabChecks(mapJobsToChecks(jobs))[0]).toMatchObject({
				status: "failure",
				url: failure.web_url,
				startedAt: failure.started_at,
				completedAt: failure.finished_at,
			});
	});
	it.each([
		"",
		"broken",
		"0",
		"2026-02-30T10:00:00Z",
		"2026-10-04T25:00:00Z",
		"2026-10-04T10:00:00",
	])("malformed native time %s remains unavailable", (value) => {
		expect(
			normalizeGitLabChecks(
				mapJobsToChecks([makeJob({ started_at: value, finished_at: value })]),
			)[0],
		).toMatchObject({ startedAt: null, completedAt: null });
	});
	it("missing raw job timestamp properties stay unavailable", () => {
		const job = makeJob();
		Reflect.deleteProperty(job, "started_at");
		Reflect.deleteProperty(job, "finished_at");
		expect(normalizeGitLabChecks(mapJobsToChecks([job]))[0]).toMatchObject({
			startedAt: null,
			completedAt: null,
		});
	});
	it("legitimate leap-day times retain exact raw values", () => {
		const stamp = "2024-02-29T23:59:59.123Z";
		expect(
			normalizeGitLabChecks(
				mapJobsToChecks([makeJob({ started_at: stamp, finished_at: stamp })]),
			)[0],
		).toMatchObject({ startedAt: stamp, completedAt: stamp });
	});
});
