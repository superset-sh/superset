import type { SidebarWorkspaceStatusEntry } from "../../../../providers/DashboardSidebarWorkspaceStatusProvider";

export function needsAttention(
	entry: Pick<SidebarWorkspaceStatusEntry, "status" | "isUnread"> | undefined,
): boolean {
	if (!entry) return false;
	return (
		entry.isUnread || entry.status === "permission" || entry.status === "failed"
	);
}

/**
 * A snoozed workspace wakes when its time passes, or when it starts to need
 * attention after it was snoozed. Attention it already had does not wake it.
 */
export function findWorkspacesToWake({
	snoozed,
	now,
	attentionById,
	previousAttentionById,
}: {
	snoozed: ReadonlyArray<{ id: string; snoozedUntil: number }>;
	now: number;
	attentionById: ReadonlyMap<string, boolean>;
	previousAttentionById: ReadonlyMap<string, boolean>;
}): string[] {
	return snoozed
		.filter(
			(workspace) =>
				workspace.snoozedUntil <= now ||
				(attentionById.get(workspace.id) === true &&
					previousAttentionById.get(workspace.id) === false),
		)
		.map((workspace) => workspace.id);
}
