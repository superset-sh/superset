import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	DashboardSidebarWorkspacePullRequest,
	SidebarStatusBucket,
} from "../../types";

export type { SidebarStatusBucket };

/** Fixed display order for the status buckets (top → bottom of the rail). */
export const SIDEBAR_STATUS_BUCKET_ORDER: readonly SidebarStatusBucket[] = [
	"working",
	"waiting",
	"open_pr",
	"done",
	"idle",
] as const;

/**
 * Maps a workspace's live pane status + PR state to a single sidebar bucket.
 *
 * Only a *live* agent outranks the PR: a running/blocked workspace is "working"
 * no matter what. Otherwise the PR is the more meaningful state — a merged or
 * open PR wins over the transient "agent just finished" signal (an agent that
 * ends by opening a PR belongs in Open PR, not Waiting). "Waiting" is reserved
 * for a finished agent with *no* PR — it handed back to you without one.
 * Precedence, top to bottom:
 *
 * - `working`/`permission` (agent processing or blocked) → **working**
 * - merged PR → **done**
 * - open/draft/queued PR → **open_pr**
 * - `review` (agent finished, and no PR) → **waiting**
 *   (awaiting the user — distinct from truly idle, per user feedback)
 * - everything else (closed-not-merged PR, no PR, seen/idle/unknown) → **idle**
 */
export function deriveSidebarStatusBucket(
	paneStatus: ActivePaneStatus | null,
	pr: DashboardSidebarWorkspacePullRequest | null,
): SidebarStatusBucket {
	if (paneStatus === "working" || paneStatus === "permission") return "working";
	if (pr?.state === "merged") return "done";
	if (
		pr &&
		(pr.state === "open" || pr.state === "draft" || pr.state === "queued")
	) {
		return "open_pr";
	}
	// Waiting is reserved for a finished agent that handed back with *no* PR. A
	// closed (unmerged) PR is not open/draft/queued/merged, so it falls through
	// here — such a workspace is idle, not waiting.
	if (paneStatus === "review" && !pr) return "waiting";
	return "idle";
}
