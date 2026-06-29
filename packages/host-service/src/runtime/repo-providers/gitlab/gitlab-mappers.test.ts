import { describe, expect, it } from "bun:test";
import { parseCheckContexts } from "../../pull-requests/utils/pull-request-mappers/pull-request-mappers";
import {
	type GitLabCommitStatus,
	type GitLabMergeRequest,
	type GitLabPipelineJob,
	mapCommitStatusesToChecks,
	mapJobsToChecks,
	mapMergeRequestToNode,
} from "./gitlab-mappers";

// ---------------------------------------------------------------------------
// Synthetic sample data (shapes match the VALIDATED GitLab REST v4 API)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// mapMergeRequestToNode
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// mapJobsToChecks → CheckRun nodes
// ---------------------------------------------------------------------------

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
	it("returns CheckRun nodes with __typename CheckRun", () => {
		const nodes = mapJobsToChecks([makeJob()]);
		expect(nodes[0]?.__typename).toBe("CheckRun");
	});

	it("maps job name to node.name", () => {
		const nodes = mapJobsToChecks([makeJob({ name: "lint" })]);
		// Non-null assertion safe — we know the array has one element
		const node = nodes[0];
		if (node?.__typename !== "CheckRun") throw new Error("Expected CheckRun");
		expect(node.name).toBe("lint");
	});

	it("maps success job → COMPLETED/SUCCESS (parseCheckContexts: success)", () => {
		const checks = parseCheckContexts(
			mapJobsToChecks([makeJob({ status: "success" })]),
		);
		expect(checks[0]?.status).toBe("success");
	});

	it("maps failed job → COMPLETED/FAILURE (parseCheckContexts: failure)", () => {
		const checks = parseCheckContexts(
			mapJobsToChecks([makeJob({ status: "failed" })]),
		);
		expect(checks[0]?.status).toBe("failure");
	});

	it("maps canceled job → COMPLETED/CANCELLED (parseCheckContexts: cancelled)", () => {
		const checks = parseCheckContexts(
			mapJobsToChecks([makeJob({ status: "canceled" })]),
		);
		expect(checks[0]?.status).toBe("cancelled");
	});

	it("maps running job → IN_PROGRESS status (parseCheckContexts: pending)", () => {
		const checks = parseCheckContexts(
			mapJobsToChecks([makeJob({ status: "running" })]),
		);
		expect(checks[0]?.status).toBe("pending");
	});

	it("maps pending job → QUEUED status (parseCheckContexts: pending)", () => {
		const checks = parseCheckContexts(
			mapJobsToChecks([makeJob({ status: "pending" })]),
		);
		expect(checks[0]?.status).toBe("pending");
	});

	it("maps created job → QUEUED status (parseCheckContexts: pending)", () => {
		const checks = parseCheckContexts(
			mapJobsToChecks([makeJob({ status: "created" })]),
		);
		expect(checks[0]?.status).toBe("pending");
	});

	it("maps skipped job → COMPLETED/SKIPPED (parseCheckContexts: skipped)", () => {
		const checks = parseCheckContexts(
			mapJobsToChecks([makeJob({ status: "skipped" })]),
		);
		expect(checks[0]?.status).toBe("skipped");
	});

	it("maps manual job → QUEUED status (parseCheckContexts: pending)", () => {
		const checks = parseCheckContexts(
			mapJobsToChecks([makeJob({ status: "manual" })]),
		);
		expect(checks[0]?.status).toBe("pending");
	});

	it("maps detailsUrl from job web_url", () => {
		const nodes = mapJobsToChecks([
			makeJob({ web_url: "https://gitlab.example.com/-/jobs/99" }),
		]);
		const node = nodes[0];
		if (node?.__typename !== "CheckRun") throw new Error("Expected CheckRun");
		expect(node.detailsUrl).toBe("https://gitlab.example.com/-/jobs/99");
	});

	it("handles an empty jobs array", () => {
		expect(mapJobsToChecks([])).toEqual([]);
	});

	it("mixed jobs array produces expected statuses after parseCheckContexts", () => {
		const jobs = [
			makeJob({ name: "build", status: "success" }),
			makeJob({ name: "test", status: "failed" }),
			makeJob({ name: "deploy", status: "running" }),
		];
		const checks = parseCheckContexts(mapJobsToChecks(jobs));
		const byName = Object.fromEntries(checks.map((c) => [c.name, c.status]));
		expect(byName.build).toBe("success");
		expect(byName.test).toBe("failure");
		expect(byName.deploy).toBe("pending");
	});
});

// ---------------------------------------------------------------------------
// mapCommitStatusesToChecks → StatusContext nodes
// ---------------------------------------------------------------------------

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
	it("returns StatusContext nodes with __typename StatusContext", () => {
		const nodes = mapCommitStatusesToChecks([makeStatus()]);
		expect(nodes[0]?.__typename).toBe("StatusContext");
	});

	it("maps status name to node.context", () => {
		const nodes = mapCommitStatusesToChecks([makeStatus({ name: "coverage" })]);
		const node = nodes[0];
		if (node?.__typename !== "StatusContext")
			throw new Error("Expected StatusContext");
		expect(node.context).toBe("coverage");
	});

	it("maps success status → SUCCESS state (parseCheckContexts: success)", () => {
		const checks = parseCheckContexts(
			mapCommitStatusesToChecks([makeStatus({ status: "success" })]),
		);
		expect(checks[0]?.status).toBe("success");
	});

	it("maps failed status → FAILURE state (parseCheckContexts: failure)", () => {
		const checks = parseCheckContexts(
			mapCommitStatusesToChecks([makeStatus({ status: "failed" })]),
		);
		expect(checks[0]?.status).toBe("failure");
	});

	it("maps pending status → PENDING state (parseCheckContexts: pending)", () => {
		const checks = parseCheckContexts(
			mapCommitStatusesToChecks([makeStatus({ status: "pending" })]),
		);
		expect(checks[0]?.status).toBe("pending");
	});

	it("maps running status → PENDING state (parseCheckContexts: pending)", () => {
		const checks = parseCheckContexts(
			mapCommitStatusesToChecks([makeStatus({ status: "running" })]),
		);
		expect(checks[0]?.status).toBe("pending");
	});

	it("maps target_url to node.targetUrl", () => {
		const nodes = mapCommitStatusesToChecks([
			makeStatus({ target_url: "https://ci.example.com/1" }),
		]);
		const node = nodes[0];
		if (node?.__typename !== "StatusContext")
			throw new Error("Expected StatusContext");
		expect(node.targetUrl).toBe("https://ci.example.com/1");
	});

	it("handles null target_url", () => {
		const nodes = mapCommitStatusesToChecks([makeStatus({ target_url: null })]);
		const node = nodes[0];
		if (node?.__typename !== "StatusContext")
			throw new Error("Expected StatusContext");
		expect(node.targetUrl).toBeNull();
	});

	it("handles an empty statuses array", () => {
		expect(mapCommitStatusesToChecks([])).toEqual([]);
	});
});
