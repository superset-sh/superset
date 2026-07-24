import {
	getHighestPriorityStatus,
	type PaneStatus,
	STATUS_PRIORITY,
} from "shared/tabs-types";
import type {
	GroupBy,
	PrBucket,
	PrototypeGroup,
	PrototypeLinearStatus,
	PrototypeLinearStatusType,
	PrototypeWorkspace,
	ViewConfig,
} from "./types";

/** Display order for the agent-status group-by (most urgent first). */
const AGENT_STATUS_LABEL: Record<PaneStatus, string> = {
	permission: "Needs input",
	failed: "Failed",
	working: "Working",
	review: "Ready for review",
	idle: "Idle",
};

/** Display order + labels for the linear-status group-by. */
const LINEAR_STATUS_ORDER: PrototypeLinearStatusType[] = [
	"in-progress",
	"in-review",
	"todo",
	"backlog",
	"done",
	"canceled",
];

/** Synthetic status for the "no Linear status" bucket's header icon. */
const NO_LINEAR_STATUS: PrototypeLinearStatus = {
	label: "No status",
	type: "todo",
	iconType: "unstarted",
	color: "#6b7280",
};

/**
 * Canonical display metadata for every Linear status. Grouping by Linear seeds
 * all of these up front so a status no workspace currently holds still renders
 * as an (empty) column — a drop target you can drag a workspace into, exactly
 * like a kanban board. Keep the colors/icons in sync with the fixtures.
 */
const LINEAR_STATUS_CATALOG: Record<
	PrototypeLinearStatusType,
	PrototypeLinearStatus
> = {
	"in-progress": {
		label: "In Progress",
		type: "in-progress",
		iconType: "started",
		color: "#f59e0b",
		progress: 50,
	},
	"in-review": {
		label: "In Review",
		type: "in-review",
		iconType: "started",
		color: "#3b82f6",
		progress: 75,
	},
	todo: {
		label: "Todo",
		type: "todo",
		iconType: "unstarted",
		color: "#9ca3af",
	},
	backlog: {
		label: "Backlog",
		type: "backlog",
		iconType: "backlog",
		color: "#9ca3af",
	},
	done: {
		label: "Done",
		type: "done",
		iconType: "completed",
		color: "#22c55e",
	},
	canceled: {
		label: "Canceled",
		type: "canceled",
		iconType: "canceled",
		color: "#9ca3af",
	},
};

/** Display order for the pull-request group-by (most actionable first). */
const PR_BUCKET_ORDER: PrBucket[] = [
	"checks-failing",
	"changes-requested",
	"awaiting-review",
	"approved",
	"queued",
	"draft",
	"merged",
	"closed",
	"no-pr",
];

const PR_BUCKET_LABEL: Record<PrBucket, string> = {
	"checks-failing": "Checks failing",
	"changes-requested": "Changes requested",
	"awaiting-review": "Awaiting review",
	approved: "Approved",
	queued: "Queued",
	draft: "Draft",
	merged: "Merged",
	closed: "Closed",
	"no-pr": "No pull request",
};

/**
 * Review-lifecycle bucket for a workspace's PR. Terminal states come from the
 * PR state itself; an open PR is classified by its most actionable signal:
 * failing checks beat a review decision, changes-requested beats approved.
 */
export function prBucketFor(workspace: PrototypeWorkspace): PrBucket {
	const pr = workspace.pullRequest;
	if (!pr) return "no-pr";
	if (pr.state === "merged") return "merged";
	if (pr.state === "closed") return "closed";
	if (pr.state === "draft") return "draft";
	if (pr.state === "queued") return "queued";
	if (pr.checksStatus === "failure") return "checks-failing";
	if (pr.reviewDecision === "changes_requested") return "changes-requested";
	if (pr.reviewDecision === "approved") return "approved";
	return "awaiting-review";
}

function compareWorkspaces(
	a: PrototypeWorkspace,
	b: PrototypeWorkspace,
	config: ViewConfig,
	manualRank: Map<string, number>,
): number {
	const dir = config.direction === "asc" ? 1 : -1;
	switch (config.orderBy) {
		case "recent":
			return (a.lastActivityAt - b.lastActivityAt) * dir;
		case "attention": {
			// The ⌘J HUD's ranking as a sort: agent-status priority first, most
			// recent activity as the tiebreak (descending = exactly the HUD).
			// Under the agent-activity GROUPING this degenerates gracefully:
			// every group member shares a status, so recency decides.
			const byStatus =
				STATUS_PRIORITY[a.agentStatus] - STATUS_PRIORITY[b.agentStatus];
			if (byStatus !== 0) return byStatus * dir;
			return (a.lastActivityAt - b.lastActivityAt) * dir;
		}
		case "created":
			return (a.createdAt - b.createdAt) * dir;
		case "title":
			return a.title.localeCompare(b.title) * dir;
		case "manual": {
			// Manual order is literal — direction deliberately ignored. Ids missing
			// from the snapshot sort last, keeping their insertion order (stable sort).
			const ra = manualRank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
			const rb = manualRank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
			return ra - rb;
		}
		default:
			return 0;
	}
}

function rollup(workspaces: PrototypeWorkspace[]) {
	return getHighestPriorityStatus(workspaces.map((w) => w.agentStatus));
}

/**
 * Assign each workspace to a group bucket keyed by the active group-by.
 * Returns groups in a stable, meaningful order (not insertion order).
 */
function groupWorkspaces(
	workspaces: PrototypeWorkspace[],
	groupBy: GroupBy,
): PrototypeGroup[] {
	if (groupBy === "none") {
		return [
			{
				key: "all",
				label: "",
				rollupStatus: rollup(workspaces),
				workspaces,
			},
		];
	}

	const buckets = new Map<string, PrototypeGroup>();

	const ensure = (
		key: string,
		init: Omit<PrototypeGroup, "workspaces" | "rollupStatus">,
	): PrototypeGroup => {
		let group = buckets.get(key);
		if (!group) {
			group = { ...init, rollupStatus: null, workspaces: [] };
			buckets.set(key, group);
		}
		return group;
	};

	if (groupBy === "linear") {
		// Seed every board column so statuses no workspace currently holds still
		// render as empty, droppable columns.
		for (const type of LINEAR_STATUS_ORDER) {
			ensure(type, {
				key: type,
				label: LINEAR_STATUS_CATALOG[type].label,
				linearStatus: LINEAR_STATUS_CATALOG[type],
			});
		}
	}

	for (const workspace of workspaces) {
		if (groupBy === "repository") {
			ensure(workspace.repo.id, {
				key: workspace.repo.id,
				label: workspace.repo.name,
				repo: workspace.repo,
			}).workspaces.push(workspace);
		} else if (groupBy === "linear") {
			const status = workspace.linearStatus ?? NO_LINEAR_STATUS;
			const key = workspace.linearStatus?.type ?? "no-status";
			ensure(key, {
				key,
				label: status.label,
				linearStatus: status,
			}).workspaces.push(workspace);
		} else if (groupBy === "pr") {
			const bucket = prBucketFor(workspace);
			ensure(bucket, {
				key: bucket,
				label: PR_BUCKET_LABEL[bucket],
				prBucket: bucket,
			}).workspaces.push(workspace);
		} else {
			// agent
			const key = workspace.agentStatus;
			ensure(key, {
				key,
				label: AGENT_STATUS_LABEL[workspace.agentStatus],
				agentStatus: workspace.agentStatus,
			}).workspaces.push(workspace);
		}
	}

	for (const group of buckets.values()) {
		group.rollupStatus = rollup(group.workspaces);
	}

	return sortGroups([...buckets.values()], groupBy);
}

function sortGroups(
	groups: PrototypeGroup[],
	groupBy: GroupBy,
): PrototypeGroup[] {
	if (groupBy === "repository") {
		return groups.sort((a, b) => a.label.localeCompare(b.label));
	}
	if (groupBy === "agent") {
		return groups.sort(
			(a, b) =>
				STATUS_PRIORITY[b.key as PaneStatus] -
				STATUS_PRIORITY[a.key as PaneStatus],
		);
	}
	if (groupBy === "linear") {
		const rank = (key: string) => {
			const idx = LINEAR_STATUS_ORDER.indexOf(key as PrototypeLinearStatusType);
			return idx === -1 ? LINEAR_STATUS_ORDER.length : idx;
		};
		return groups.sort((a, b) => rank(a.key) - rank(b.key));
	}
	if (groupBy === "pr") {
		const rank = (key: string) => {
			const idx = PR_BUCKET_ORDER.indexOf(key as PrBucket);
			return idx === -1 ? PR_BUCKET_ORDER.length : idx;
		};
		return groups.sort((a, b) => rank(a.key) - rank(b.key));
	}
	return groups;
}

/**
 * Pure view builder for the attention prototype: group, then order within each
 * group, and compute a worst-case status rollup per group.
 */
export function buildPrototypeView(
	workspaces: PrototypeWorkspace[],
	config: ViewConfig,
): PrototypeGroup[] {
	const manualRank = new Map(config.manualOrder.map((id, i) => [id, i]));
	const groups = groupWorkspaces(workspaces, config.groupBy);
	for (const group of groups) {
		group.workspaces = [...group.workspaces].sort((a, b) =>
			compareWorkspaces(a, b, config, manualRank),
		);
	}
	return groups;
}

/**
 * Ranking for the ⌘J HUD: attention-first (by status priority), then by most
 * recent activity. Independent of the list's group-by/order-by.
 */
export function rankForHud(
	workspaces: PrototypeWorkspace[],
): PrototypeWorkspace[] {
	return [...workspaces].sort((a, b) => {
		const byStatus =
			STATUS_PRIORITY[b.agentStatus] - STATUS_PRIORITY[a.agentStatus];
		if (byStatus !== 0) return byStatus;
		return b.lastActivityAt - a.lastActivityAt;
	});
}
