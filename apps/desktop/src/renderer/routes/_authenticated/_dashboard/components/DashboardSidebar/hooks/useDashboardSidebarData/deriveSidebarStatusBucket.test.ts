import { describe, expect, it } from "bun:test";
import type { DashboardSidebarWorkspacePullRequest } from "../../types";
import { deriveSidebarStatusBucket } from "./deriveSidebarStatusBucket";

function pr(
	state: DashboardSidebarWorkspacePullRequest["state"],
): DashboardSidebarWorkspacePullRequest {
	return {
		url: "https://github.com/owner/repo/pull/1",
		number: 1,
		title: "Example",
		state,
		reviewDecision: null,
		checksStatus: "none",
		checks: [],
	};
}

describe("deriveSidebarStatusBucket", () => {
	it("active work wins over any PR state (D3)", () => {
		expect(deriveSidebarStatusBucket("working", pr("open"))).toBe("working");
		expect(deriveSidebarStatusBucket("working", pr("merged"))).toBe("working");
		expect(deriveSidebarStatusBucket("permission", pr("merged"))).toBe(
			"working",
		);
		expect(deriveSidebarStatusBucket("working", null)).toBe("working");
		expect(deriveSidebarStatusBucket("permission", null)).toBe("working");
	});

	it("`review` → waiting only when there's no PR (a PR outranks agent-finished)", () => {
		// Agent-finished/unread (green dot) with no PR is distinct from truly idle.
		expect(deriveSidebarStatusBucket("review", null)).toBe("waiting");
		// ...but an open/merged PR is the more meaningful state and wins: an agent
		// that ends by opening a PR belongs in Open PR / Done, not Waiting.
		expect(deriveSidebarStatusBucket("review", pr("open"))).toBe("open_pr");
		expect(deriveSidebarStatusBucket("review", pr("merged"))).toBe("done");
		// ...and a *closed* (unmerged) PR means the agent didn't hand back without
		// one — it's idle, not waiting.
		expect(deriveSidebarStatusBucket("review", pr("closed"))).toBe("idle");
	});

	it("merged PR → done when no active work", () => {
		expect(deriveSidebarStatusBucket(null, pr("merged"))).toBe("done");
	});

	it("open / draft / queued PR → open_pr when no active work (D2: drafts are Open PR)", () => {
		expect(deriveSidebarStatusBucket(null, pr("open"))).toBe("open_pr");
		expect(deriveSidebarStatusBucket(null, pr("draft"))).toBe("open_pr");
		expect(deriveSidebarStatusBucket(null, pr("queued"))).toBe("open_pr");
	});

	it("closed-not-merged, no PR, or unresolved status → idle", () => {
		expect(deriveSidebarStatusBucket(null, pr("closed"))).toBe("idle");
		expect(deriveSidebarStatusBucket(null, null)).toBe("idle");
	});
});
