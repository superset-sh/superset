import { useWorkspaceClient } from "@superset/workspace-client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { acquireDocument, releaseDocument } from "./fileDocumentStore";
import type { SharedFileDocument } from "./types";

interface UseSharedFileDocumentParams {
	workspaceId: string;
	absolutePath: string;
}

export function useSharedFileDocument({
	workspaceId,
	absolutePath,
}: UseSharedFileDocumentParams): SharedFileDocument {
	const { trpcClient } = useWorkspaceClient();

	const [state, setState] = useState<{
		handle: SharedFileDocument;
		workspaceId: string;
		absolutePath: string;
	}>(() => ({
		handle: acquireDocument(workspaceId, absolutePath, trpcClient),
		workspaceId,
		absolutePath,
	}));

	// Swap handles synchronously when the pane is retargeted at a different
	// file (e.g. a preview pane reassigned from env.ts to bun.lock). setState
	// during render restarts the render before commit so consumers never
	// observe a handle pointing at the previous file.
	if (
		state.workspaceId !== workspaceId ||
		state.absolutePath !== absolutePath
	) {
		// Rename case: the entry behind our existing handle was migrated to
		// match the new props. Reuse the handle — acquiring again would bump
		// refCount a second time and release() of the old key no-ops (the
		// entry isn't at that key anymore), which would leak one lease per
		// rename.
		const handleAlreadyPointsAtNewPath =
			state.handle.workspaceId === workspaceId &&
			state.handle.absolutePath === absolutePath;
		const handle = handleAlreadyPointsAtNewPath
			? state.handle
			: acquireDocument(workspaceId, absolutePath, trpcClient);
		setState({ handle, workspaceId, absolutePath });
	}

	useEffect(() => {
		return () => {
			releaseDocument(workspaceId, absolutePath);
		};
	}, [workspaceId, absolutePath]);

	useSyncExternalStore(
		state.handle.subscribe,
		state.handle.getVersion,
		state.handle.getVersion,
	);

	return state.handle;
}
