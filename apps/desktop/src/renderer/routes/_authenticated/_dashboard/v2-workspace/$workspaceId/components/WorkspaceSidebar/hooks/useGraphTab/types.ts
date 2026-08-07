// Seam between the graph's data/algorithm layer and its presentation layer.
// `assignLanes` produces GraphRowModel[]; GraphRow / GraphLanes / RefBadge
// consume it. Nothing here imports React, tRPC, or a collection.
//
// Geometry and colour live in apps/desktop/plans/20260801-1200-git-graph-visual-spec.md.

/** How a ref decorates a commit. Classified from a full refname via ResolvedRef — never a shortname prefix. */
export type GraphRefType = "head" | "branch" | "remote" | "tag";

/** Which refs seed the traversal. Mirrors host-service `GraphRefScope` and the
 *  persisted `graphRefScope` enum. */
export type GraphRefScope =
	| "local"
	| "open-workspaces"
	| "remote"
	| "all"
	| "head";

/**
 * Whether a local branch is claimed by an open workspace, sitting on disk
 * unclaimed, or nothing but a name. Remote refs, tags and HEAD carry `null`.
 */
export type GraphRefState =
	| "open"
	| "detached-worktree"
	| "orphan-branch"
	| "prunable"
	| "merged";

export interface GraphRef {
	name: string;
	type: GraphRefType;
	state: GraphRefState | null;
	worktreePath?: string;
	/** Absent when the worktree has no open Superset workspace. */
	worktreeWorkspaceId?: string;
	/** Only on `prunable`; surfaced in the badge's tooltip. */
	pruneReason?: string;
}

export interface GraphCommit {
	hash: string;
	shortHash: string;
	message: string;
	author: string;
	authorEmail: string;
	date: string;
	parents: string[];
	refs: GraphRef[];
}

/**
 * One painted segment in a row's lane column.
 *
 * - `pass` — lane crosses the row untouched
 * - `in-straight` — the commit's own lane, entering from above
 * - `in-merge` — another lane awaiting this commit, closing into the node
 * - `out-straight` — first parent inherits the lane
 * - `out-fork` — an extra parent leaves toward another lane
 * - `out-stub` — parent lies outside the fetched window; renders dashed and stops short
 */
export type GraphEdgeKind =
	| "pass"
	| "in-straight"
	| "in-merge"
	| "out-straight"
	| "out-fork"
	| "out-stub";

export interface GraphEdge {
	kind: GraphEdgeKind;
	fromLane: number;
	toLane: number;
	/** 1-8, indexing --graph-lane-N. Keyed to the lane's originating branch, not its position. */
	color: GraphLaneColor;
}

export type GraphLaneColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface GraphRowModel {
	commit: GraphCommit;
	lane: number;
	color: GraphLaneColor;
	isMerge: boolean;
	isRoot: boolean;
	edges: GraphEdge[];
	/** Lanes live in this row, before the visible-lane cap is applied. */
	laneCount: number;
}
