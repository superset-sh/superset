import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
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

export const BOARD_COLUMN_LABELS: Record<BoardColumnKey, MessageDescriptor> = {
	idle: msg({ message: "Idle" }),
	working: msg({
		message: "Working",
	}),
	attention: msg({
		message: "Needs attention",
	}),
	review: msg({
		message: "Needs review",
	}),
	merged: msg({
		message: "Merged",
	}),
	deleted: msg({
		message: "Deleted",
	}),
};

type BoardColumnInputs = Pick<
	AccessibleV2Workspace,
	"archivedAt" | "archiveReason" | "agentStatus" | "type"
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
 *   6. PR open/draft/queued              → Needs review
 *   7. agent review on a worktree        → Needs review
 *   8. otherwise                         → Idle
 *
 * A finished agent alone only counts as review-worthy on worktree
 * workspaces: session runs (automations, chats) and main checkouts have no
 * branch to review, and they arrive in volume — routing them to "review"
 * buries the real candidates (the bucket answers "what needs me").
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
		workspace.pr?.state === "open" ||
		workspace.pr?.state === "draft" ||
		workspace.pr?.state === "queued"
	) {
		return "review";
	}
	if (workspace.agentStatus === "review" && workspace.type === "worktree") {
		return "review";
	}
	return "idle";
}
