import { describe, expect, it } from "bun:test";

import type { GitLabMergeRequest } from "./client";
import { buildReviewState, mapPipelineStatus, mapState } from "./mappers";

function mkMr(o: Partial<GitLabMergeRequest> = {}): GitLabMergeRequest {
	return {
		id: 1,
		iid: 1,
		project_id: 1,
		title: "t",
		web_url: "https://gitlab.com/acme/app/-/merge_requests/1",
		source_branch: "feature",
		target_branch: "main",
		sha: "abc123",
		state: "opened",
		author: { username: "alice", avatar_url: null },
		merged_at: null,
		closed_at: null,
		updated_at: "2026-01-01T00:00:00Z",
		...o,
	};
}

describe("mapState", () => {
	it("maps GitLab states and folds draft only when open", () => {
		expect(mapState("opened", false)).toBe("open");
		expect(mapState("opened", true)).toBe("draft");
		expect(mapState("opened", undefined)).toBe("open");
		expect(mapState("closed", false)).toBe("closed");
		expect(mapState("merged", false)).toBe("merged");
		expect(mapState("locked", false)).toBe("locked"); // preserved, not reduced to closed
		expect(mapState("merged", true)).toBe("merged"); // draft ignored when not open
	});
});

describe("mapPipelineStatus", () => {
	it("maps to the checks rollup enum (none|pending|success|failure)", () => {
		expect(mapPipelineStatus("success")).toBe("success");
		expect(mapPipelineStatus("failed")).toBe("failure");
		for (const s of [
			"running",
			"pending",
			"created",
			"preparing",
			"waiting_for_resource",
			"scheduled",
		]) {
			expect(mapPipelineStatus(s)).toBe("pending");
		}
		for (const s of ["canceled", "skipped", "manual"]) {
			expect(mapPipelineStatus(s)).toBe("none");
		}
		expect(mapPipelineStatus(undefined)).toBe("none");
	});
});

describe("buildReviewState (§6 no-reduction)", () => {
	it("stores GitLab's server-computed facts verbatim", () => {
		const r = buildReviewState(
			mkMr({
				detailed_merge_status: "mergeable",
				has_conflicts: false,
				blocking_discussions_resolved: true,
			}),
			{
				approvals_required: 2,
				approvals_left: 1,
				approved_by: [
					{ user: { username: "alice" } },
					{ user: { username: "bob" } },
				],
			},
		);
		expect(r).toEqual({
			provider: "gitlab",
			detailedMergeStatus: "mergeable",
			approvalsRequired: 2,
			approvalsLeft: 1,
			approvedBy: ["alice", "bob"],
			blockingDiscussionsResolved: true,
			hasConflicts: false,
		});
	});

	it("leaves unknown approval facts null (never inferred) when approvals absent", () => {
		const r = buildReviewState(
			mkMr({ detailed_merge_status: "mergeable" }),
			null,
		);
		expect(r.approvalsRequired).toBeNull();
		expect(r.approvalsLeft).toBeNull();
		expect(r.approvedBy).toEqual([]);
	});

	it("uses empty detailedMergeStatus when an older GitLab omits it", () => {
		const r = buildReviewState(
			mkMr({ detailed_merge_status: undefined }),
			null,
		);
		expect(r.detailedMergeStatus).toBe("");
	});

	it("preserves requested_changes (the changes-requested signal) without reduction", () => {
		const r = buildReviewState(
			mkMr({ detailed_merge_status: "requested_changes" }),
			null,
		);
		expect(r.detailedMergeStatus).toBe("requested_changes");
	});
});
