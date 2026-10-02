import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { CreateNewAgentSession } from "../useAgentSessionLauncher";

/**
 * Open the chat a branch left for this workspace. The conversation could not
 * be resumed here — an agent keys its sessions to a project directory — so it
 * arrives as the first message of a new one (see queuePendingChatHandoff).
 *
 * One-shot: the row is cleared before the chat is created, so a reopen, or a
 * re-render while the create is in flight, cannot run it twice. Gated on
 * layout hydration, or the pane would be added to the pre-hydration blank and
 * then thrown away.
 */
export function useRunPendingChatHandoff({
	workspaceId,
	isLayoutReady,
	createNewAgentSession,
}: {
	workspaceId: string;
	isLayoutReady: boolean;
	createNewAgentSession: CreateNewAgentSession;
}): void {
	const collections = useCollections();
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.where(({ v2WorkspaceLocalState }) =>
					eq(v2WorkspaceLocalState.workspaceId, workspaceId),
				),
		[collections, workspaceId],
	);
	const pending =
		rows.find((row) => row.workspaceId === workspaceId)?.pendingChatHandoff ??
		null;
	const agentId = pending?.agentId;
	const prompt = pending?.prompt;

	useEffect(() => {
		if (!isLayoutReady || !agentId || !prompt) return;
		// The row can vanish between render and effect (sidebar delete, another
		// window); TanStack DB's update throws on a missing key.
		if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.pendingChatHandoff = null;
		});
		void createNewAgentSession({
			configId: agentId,
			placement: "new-tab",
			prompt,
		});
	}, [
		isLayoutReady,
		agentId,
		prompt,
		workspaceId,
		collections,
		createNewAgentSession,
	]);
}
