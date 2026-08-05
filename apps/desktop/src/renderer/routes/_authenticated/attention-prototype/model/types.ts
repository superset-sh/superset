import type {
	DashboardSidebarWorkspaceHostType,
	DashboardSidebarWorkspacePullRequest,
	DashboardSidebarWorkspaceType,
} from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/types";
import type { StatusType } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import type { ActivePaneStatus, PaneStatus } from "shared/tabs-types";

/**
 * PROTOTYPE-ONLY view model.
 *
 * This is a flattened, self-contained shape for the attention-prototype route.
 * It deliberately carries fields that do NOT exist on the real
 * `DashboardSidebarWorkspace` today, so we can play with the proposed
 * group-by/order-by view system without touching live data:
 *
 *  - `agentStatus`   — real status is a `PaneStatus` resolved per-workspace via
 *                      hooks (useTerminalAgentStatuses); it is NOT a field on the
 *                      workspace object. Modeled inline here for the fixtures.
 *  - `lastActivityAt`— "Recent" ordering key. The real analogue lives on the
 *                      terminal binding (`TerminalAgentBinding.lastEventAt`), not
 *                      on the workspace. Net-new here.
 *  - `linearStatus`  — there is no dedicated "Linear status" field in the app; it
 *                      is the generic task status (SelectTaskStatus.type/name/color)
 *                      with Linear only as sync provenance. Reused + relabeled here.
 */
export interface PrototypeRepo {
	id: string;
	name: string;
	owner: string | null;
	iconUrl: string | null;
}

/** Reuses the generic Superset task-status vocabulary, relabeled "Linear". */
export type PrototypeLinearStatusType =
	| "backlog"
	| "todo"
	| "in-progress"
	| "in-review"
	| "done"
	| "canceled";

export interface PrototypeLinearStatus {
	label: string;
	type: PrototypeLinearStatusType;
	/** Icon variant in the real StatusIcon's Linear vocabulary. */
	iconType: StatusType;
	/** Hex stroke color for the StatusIcon (real app stores hex on the status). */
	color: string;
	/** 0-100 pie fill for "started" icons (In Progress vs In Review). */
	progress?: number;
}

/** Fixture stand-in for a detected dev-server port on a workspace. */
export interface PrototypePort {
	port: number;
	label: string | null;
	processName: string;
	pid: number;
}

export interface PrototypeWorkspace {
	id: string;
	title: string;
	repo: PrototypeRepo;
	/** Net-new on the workspace (see file docblock). */
	agentStatus: PaneStatus;
	pullRequest: DashboardSidebarWorkspacePullRequest | null;
	linearStatus: PrototypeLinearStatus | null;
	/** ms epoch — the "Recent" (last interacted) ordering key. Net-new. */
	lastActivityAt: number;
	/** ms epoch. */
	createdAt: number;
	diff: { additions: number; deletions: number };
	hostType: DashboardSidebarWorkspaceHostType;
	workspaceType: DashboardSidebarWorkspaceType;
	hostIsOnline: boolean | null;
	/** Running dev-server ports (real app resolves these via the ports provider). */
	ports: PrototypePort[];
}

export type GroupBy = "none" | "repository" | "linear" | "agent" | "pr";

/**
 * Review-lifecycle buckets for the pull-request group-by. Deliberately
 * provider-neutral semantics (GitLab MRs have the same lifecycle); only the
 * display strings say "pull request", matching the app's current vocabulary.
 */
export type PrBucket =
	| "checks-failing"
	| "changes-requested"
	| "awaiting-review"
	| "approved"
	| "queued"
	| "draft"
	| "merged"
	| "closed"
	| "no-pr";
export type OrderBy = "recent" | "title" | "created" | "manual" | "attention";
export type Direction = "asc" | "desc";

export interface ViewConfig {
	groupBy: GroupBy;
	orderBy: OrderBy;
	direction: Direction;
	/**
	 * Flat workspace-id order used by the "manual" order-by. A snapshot of the
	 * full visual order at the moment the user last dragged (or picked Manual),
	 * so sorting each group by rank reproduces that layout exactly.
	 */
	manualOrder: string[];
}

export interface PrototypeGroup {
	/** Stable key for React and grouping identity. */
	key: string;
	/** Human label for the group header ("" for the single "none" group). */
	label: string;
	/**
	 * Optional presentational hints for the header's leading icon, depending on
	 * group-by:
	 *  - repository → repo for a ProjectThumbnail
	 *  - linear     → status for a real Linear StatusIcon
	 *  - agent      → the bucket's own PaneStatus for a status icon
	 *  - pr         → the bucket id for a PR-lifecycle icon
	 */
	repo?: PrototypeRepo;
	linearStatus?: PrototypeLinearStatus;
	agentStatus?: PaneStatus;
	prBucket?: PrBucket;
	/** Worst-case (highest-priority) active status across the group, if any. */
	rollupStatus: ActivePaneStatus | null;
	workspaces: PrototypeWorkspace[];
}
