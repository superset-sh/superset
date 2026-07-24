import { describe, expect, it } from "bun:test";
import type { PaneStatus } from "shared/tabs-types";
import { buildPrototypeView, rankForHud } from "./buildPrototypeView";
import type {
	PrototypeLinearStatus,
	PrototypeWorkspace,
	ViewConfig,
} from "./types";

const NOW = new Date("2026-07-20T12:00:00.000Z").getTime();
const MIN = 60_000;

const LINEAR: Record<string, PrototypeLinearStatus> = {
	inProgress: {
		label: "In Progress",
		type: "in-progress",
		iconType: "started",
		color: "#f59e0b",
		progress: 50,
	},
	inReview: {
		label: "In Review",
		type: "in-review",
		iconType: "started",
		color: "#3b82f6",
		progress: 75,
	},
	done: {
		label: "Done",
		type: "done",
		iconType: "completed",
		color: "#22c55e",
	},
};

function makeWorkspace(
	overrides: Partial<PrototypeWorkspace> = {},
): PrototypeWorkspace {
	return {
		id: "ws-1",
		title: "Workspace",
		repo: { id: "repo-a", name: "alpha", owner: "acme", iconUrl: null },
		agentStatus: "idle",
		pullRequest: null,
		linearStatus: null,
		lastActivityAt: NOW,
		createdAt: NOW,
		diff: { additions: 0, deletions: 0 },
		hostType: "local-device",
		workspaceType: "worktree",
		hostIsOnline: null,
		ports: [],
		...overrides,
	};
}

const config = (overrides: Partial<ViewConfig> = {}): ViewConfig => ({
	groupBy: "none",
	orderBy: "recent",
	direction: "desc",
	manualOrder: [],
	...overrides,
});

describe("buildPrototypeView — grouping", () => {
	it("returns a single unlabeled group for group-by none", () => {
		const groups = buildPrototypeView(
			[makeWorkspace({ id: "a" }), makeWorkspace({ id: "b" })],
			config({ groupBy: "none" }),
		);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.key).toBe("all");
		expect(groups[0]?.label).toBe("");
		expect(groups[0]?.workspaces).toHaveLength(2);
	});

	it("groups by repository and orders groups alphabetically by name", () => {
		const groups = buildPrototypeView(
			[
				makeWorkspace({
					id: "b",
					repo: { id: "repo-b", name: "zeta", owner: null, iconUrl: null },
				}),
				makeWorkspace({
					id: "a",
					repo: { id: "repo-a", name: "alpha", owner: null, iconUrl: null },
				}),
			],
			config({ groupBy: "repository" }),
		);
		expect(groups.map((g) => g.label)).toEqual(["alpha", "zeta"]);
		expect(groups[0]?.repo?.id).toBe("repo-a");
	});

	it("groups by agent status ordered by priority (most urgent first)", () => {
		const statuses: PaneStatus[] = [
			"review",
			"permission",
			"working",
			"idle",
			"failed",
		];
		const groups = buildPrototypeView(
			statuses.map((s, i) => makeWorkspace({ id: `ws-${i}`, agentStatus: s })),
			config({ groupBy: "agent" }),
		);
		expect(groups.map((g) => g.key)).toEqual([
			"permission",
			"failed",
			"working",
			"review",
			"idle",
		]);
	});

	it("groups by pull request into lifecycle buckets, most actionable first", () => {
		const prBase = {
			url: "https://example.com/pr/1",
			number: 1,
			title: "PR",
			checks: [],
		};
		const groups = buildPrototypeView(
			[
				makeWorkspace({ id: "none", pullRequest: null }),
				makeWorkspace({
					id: "merged",
					pullRequest: {
						...prBase,
						state: "merged",
						reviewDecision: null,
						checksStatus: "none",
					},
				}),
				makeWorkspace({
					id: "failing",
					// Failing checks beat the approved review decision.
					pullRequest: {
						...prBase,
						state: "open",
						reviewDecision: "approved",
						checksStatus: "failure",
					},
				}),
				makeWorkspace({
					id: "awaiting",
					pullRequest: {
						...prBase,
						state: "open",
						reviewDecision: "pending",
						checksStatus: "success",
					},
				}),
			],
			config({ groupBy: "pr" }),
		);
		expect(groups.map((g) => g.key)).toEqual([
			"checks-failing",
			"awaiting-review",
			"merged",
			"no-pr",
		]);
		expect(groups.map((g) => g.label)).toEqual([
			"Checks failing",
			"Awaiting review",
			"Merged",
			"No pull request",
		]);
	});

	it("groups by linear status as a full board: every column present, empty ones included, 'No status' last", () => {
		const groups = buildPrototypeView(
			[
				makeWorkspace({ id: "a", linearStatus: LINEAR.done }),
				makeWorkspace({ id: "b", linearStatus: null }),
				makeWorkspace({ id: "c", linearStatus: LINEAR.inProgress }),
			],
			config({ groupBy: "linear" }),
		);
		expect(groups.map((g) => g.label)).toEqual([
			"In Progress",
			"In Review",
			"Todo",
			"Backlog",
			"Done",
			"Canceled",
			"No status",
		]);
		const byKey = new Map(groups.map((g) => [g.key, g]));
		expect(byKey.get("in-progress")?.workspaces.map((w) => w.id)).toEqual([
			"c",
		]);
		expect(byKey.get("done")?.workspaces.map((w) => w.id)).toEqual(["a"]);
		expect(byKey.get("no-status")?.workspaces.map((w) => w.id)).toEqual(["b"]);
		// Columns no workspace occupies still render — they are empty drop targets.
		expect(byKey.get("in-review")?.workspaces).toEqual([]);
		expect(byKey.get("backlog")?.workspaces).toEqual([]);
		expect(byKey.get("canceled")?.workspaces).toEqual([]);
	});

	it("shows all linear columns even when every workspace already has a status", () => {
		const groups = buildPrototypeView(
			[makeWorkspace({ id: "a", linearStatus: LINEAR.inProgress })],
			config({ groupBy: "linear" }),
		);
		// All six board columns present; no "No status" column, since nothing is unset.
		expect(groups.map((g) => g.key)).toEqual([
			"in-progress",
			"in-review",
			"todo",
			"backlog",
			"done",
			"canceled",
		]);
	});
});

describe("buildPrototypeView — ordering", () => {
	it("orders by recent descending by default", () => {
		const groups = buildPrototypeView(
			[
				makeWorkspace({ id: "old", lastActivityAt: NOW - 10 * MIN }),
				makeWorkspace({ id: "new", lastActivityAt: NOW }),
				makeWorkspace({ id: "mid", lastActivityAt: NOW - 5 * MIN }),
			],
			config({ orderBy: "recent", direction: "desc" }),
		);
		expect(groups[0]?.workspaces.map((w) => w.id)).toEqual([
			"new",
			"mid",
			"old",
		]);
	});

	it("respects ascending direction", () => {
		const groups = buildPrototypeView(
			[
				makeWorkspace({ id: "new", lastActivityAt: NOW }),
				makeWorkspace({ id: "old", lastActivityAt: NOW - 10 * MIN }),
			],
			config({ orderBy: "recent", direction: "asc" }),
		);
		expect(groups[0]?.workspaces.map((w) => w.id)).toEqual(["old", "new"]);
	});

	it("orders by attention (ungrouped, descending) exactly like the ⌘J HUD", () => {
		const workspaces = [
			makeWorkspace({
				id: "idle-new",
				agentStatus: "idle",
				lastActivityAt: NOW,
			}),
			makeWorkspace({
				id: "review-old",
				agentStatus: "review",
				lastActivityAt: NOW - 30 * MIN,
			}),
			makeWorkspace({
				id: "blocked",
				agentStatus: "permission",
				lastActivityAt: NOW - 60 * MIN,
			}),
			makeWorkspace({
				id: "working",
				agentStatus: "working",
				lastActivityAt: NOW - 5 * MIN,
			}),
		];
		const groups = buildPrototypeView(
			workspaces,
			config({ groupBy: "none", orderBy: "attention", direction: "desc" }),
		);
		expect(groups[0]?.workspaces.map((w) => w.id)).toEqual(
			rankForHud(workspaces).map((w) => w.id),
		);
	});

	it("orders by title", () => {
		const groups = buildPrototypeView(
			[
				makeWorkspace({ id: "c", title: "Charlie" }),
				makeWorkspace({ id: "a", title: "Alpha" }),
				makeWorkspace({ id: "b", title: "Bravo" }),
			],
			config({ orderBy: "title", direction: "asc" }),
		);
		expect(groups[0]?.workspaces.map((w) => w.title)).toEqual([
			"Alpha",
			"Bravo",
			"Charlie",
		]);
	});

	it("orders by manual rank within each group, ignoring direction", () => {
		const groups = buildPrototypeView(
			[
				makeWorkspace({ id: "a" }),
				makeWorkspace({ id: "b" }),
				makeWorkspace({ id: "c" }),
			],
			config({
				orderBy: "manual",
				direction: "asc",
				manualOrder: ["c", "a", "b"],
			}),
		);
		expect(groups[0]?.workspaces.map((w) => w.id)).toEqual(["c", "a", "b"]);
	});

	it("sorts ids missing from manualOrder last, keeping insertion order", () => {
		const groups = buildPrototypeView(
			[
				makeWorkspace({ id: "x" }),
				makeWorkspace({ id: "b" }),
				makeWorkspace({ id: "y" }),
				makeWorkspace({ id: "a" }),
			],
			config({ orderBy: "manual", manualOrder: ["a", "b"] }),
		);
		expect(groups[0]?.workspaces.map((w) => w.id)).toEqual([
			"a",
			"b",
			"x",
			"y",
		]);
	});

	it("applies manual order per group when grouped", () => {
		const repoA = { id: "repo-a", name: "alpha", owner: null, iconUrl: null };
		const repoB = { id: "repo-b", name: "beta", owner: null, iconUrl: null };
		const groups = buildPrototypeView(
			[
				makeWorkspace({ id: "a1", repo: repoA }),
				makeWorkspace({ id: "b1", repo: repoB }),
				makeWorkspace({ id: "a2", repo: repoA }),
				makeWorkspace({ id: "b2", repo: repoB }),
			],
			config({
				groupBy: "repository",
				orderBy: "manual",
				manualOrder: ["a2", "b2", "a1", "b1"],
			}),
		);
		expect(groups.map((g) => g.workspaces.map((w) => w.id))).toEqual([
			["a2", "a1"],
			["b2", "b1"],
		]);
	});
});

describe("buildPrototypeView — rollup", () => {
	it("computes worst-case active status per group", () => {
		const groups = buildPrototypeView(
			[
				makeWorkspace({ id: "a", agentStatus: "review" }),
				makeWorkspace({ id: "b", agentStatus: "permission" }),
				makeWorkspace({ id: "c", agentStatus: "working" }),
			],
			config({ groupBy: "none" }),
		);
		expect(groups[0]?.rollupStatus).toBe("permission");
	});

	it("returns null rollup when all idle", () => {
		const groups = buildPrototypeView(
			[makeWorkspace({ id: "a", agentStatus: "idle" })],
			config({ groupBy: "none" }),
		);
		expect(groups[0]?.rollupStatus).toBeNull();
	});

	it("does not mutate the input array", () => {
		const input = [
			makeWorkspace({ id: "old", lastActivityAt: NOW - MIN }),
			makeWorkspace({ id: "new", lastActivityAt: NOW }),
		];
		const snapshot = input.map((w) => w.id);
		buildPrototypeView(input, config({ orderBy: "recent", direction: "desc" }));
		expect(input.map((w) => w.id)).toEqual(snapshot);
	});
});

describe("rankForHud", () => {
	it("ranks by status priority, then recency", () => {
		const ranked = rankForHud([
			makeWorkspace({
				id: "idle-new",
				agentStatus: "idle",
				lastActivityAt: NOW,
			}),
			makeWorkspace({
				id: "perm-old",
				agentStatus: "permission",
				lastActivityAt: NOW - 60 * MIN,
			}),
			makeWorkspace({
				id: "review-new",
				agentStatus: "review",
				lastActivityAt: NOW,
			}),
			makeWorkspace({
				id: "perm-new",
				agentStatus: "permission",
				lastActivityAt: NOW,
			}),
		]);
		expect(ranked.map((w) => w.id)).toEqual([
			"perm-new",
			"perm-old",
			"review-new",
			"idle-new",
		]);
	});
});
