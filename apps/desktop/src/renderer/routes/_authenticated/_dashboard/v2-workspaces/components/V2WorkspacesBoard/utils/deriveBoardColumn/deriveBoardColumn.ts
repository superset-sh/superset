import type {
	AccessibleV2Workspace,
	V2WorkspacePrState,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

export type BoardColumnKey =
	| "idle"
	| "working"
	| "attention"
	| "review"
	| "merged"
	| "deleted";

/** Fixed Linear-style workflow order — never user-reorderable. */
export const BOARD_COLUMN_ORDER: BoardColumnKey[] = [
	"idle",
	"working",
	"attention",
	"review",
	"merged",
	"deleted",
];

export const BOARD_COLUMN_LABELS: Record<BoardColumnKey, string> = {
	idle: "Idle",
	working: "Working",
	attention: "Needs attention",
	review: "Needs review",
	merged: "Merged",
	deleted: "Deleted",
};

type BoardColumnInputs = Pick<
	AccessibleV2Workspace,
	"archivedAt" | "archiveReason" | "agentStatus"
> & {
	pr: { state: V2WorkspacePrState } | null;
};

/**
 * Column derivation, first match wins:
 *   1. archived "deleted"                → Deleted
 *   2. archived "merged"                 → Merged
 *   3. live PR merged                    → Merged
 *   4. agent permission/failed           → Needs attention
 *   5. agent working                     → Working
 *   6. agent review, or PR open/draft/queued → Needs review
 *   7. otherwise                         → Idle
 */
export function deriveBoardColumn(
	workspace: BoardColumnInputs,
): BoardColumnKey {
	if (workspace.archivedAt != null) {
		return workspace.archiveReason === "merged" ? "merged" : "deleted";
	}
	if (workspace.pr?.state === "merged") return "merged";
	if (
		workspace.agentStatus === "permission" ||
		workspace.agentStatus === "failed"
	) {
		return "attention";
	}
	if (workspace.agentStatus === "working") return "working";
	if (
		workspace.agentStatus === "review" ||
		workspace.pr?.state === "open" ||
		workspace.pr?.state === "draft" ||
		workspace.pr?.state === "queued"
	) {
		return "review";
	}
	return "idle";
}
