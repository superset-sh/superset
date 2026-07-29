import type { PendingMigratedTerminal } from "renderer/lib/v1-migration/terminals";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { writeWorkspacePaneLayout } from "./writeWorkspacePaneLayout";

/**
 * Queue v1-migrated terminals for lazy recreation on first workspace open
 * (consumed by useCreatePendingMigratedTerminals). Ensures the local-state
 * row exists first — an adopted workspace may never have been opened.
 */
export function appendPendingMigratedTerminals(
	collections: AppCollections,
	workspace: { id: string; projectId: string },
	terminals: PendingMigratedTerminal[],
): void {
	if (terminals.length === 0) return;
	if (!collections.v2WorkspaceLocalState.get(workspace.id)) {
		writeWorkspacePaneLayout(collections, workspace, [], []);
	}
	collections.v2WorkspaceLocalState.update(workspace.id, (draft) => {
		const existing = draft.pendingMigratedTerminals ?? [];
		const seen = new Set(existing.map((t) => t.terminalId));
		draft.pendingMigratedTerminals = [
			...existing,
			...terminals.filter((t) => !seen.has(t.terminalId)),
		];
	});
}
