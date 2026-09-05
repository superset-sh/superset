import type { ArchiveWorkspaceSource } from "renderer/lib/workspaces/useArchiveWorkspaceFlow";
import { create } from "zustand";

export interface ArchiveWorkspaceRequest {
	requestId: number;
	workspaceIds: string[];
	source: ArchiveWorkspaceSource;
}

/**
 * Every archive entry point — sidebar row button, sidebar menu, the Close
 * Workspace hotkey, the command palette, the Workspaces page menus, bulk
 * selection — requests through here, and the single globally-mounted
 * ArchiveWorkspaceMount runs the shared archive flow. One flow instance
 * app-wide: the flow needs the router, the collections, and the
 * navigate-away helper (which flattens the whole sidebar order), so a hook
 * per sidebar row would cost O(rows²) on every list change, and the palette
 * runs outside React and can't call hooks at all.
 *
 * A queue, not a single slot: a bulk archive and a hotkey can land in the
 * same tick, and neither may swallow the other.
 */
interface ArchiveWorkspaceIntentState {
	queue: ArchiveWorkspaceRequest[];
	nextRequestId: number;
	request: (input: {
		workspaceIds: string[];
		source: ArchiveWorkspaceSource;
	}) => void;
	/** Drop the head of the queue — only if it is still `requestId`. */
	shift: (requestId: number) => void;
}

export const useArchiveWorkspaceIntent = create<ArchiveWorkspaceIntentState>(
	(set) => ({
		queue: [],
		nextRequestId: 1,
		request: ({ workspaceIds, source }) =>
			set((state) =>
				workspaceIds.length === 0
					? state
					: {
							queue: [
								...state.queue,
								{ requestId: state.nextRequestId, workspaceIds, source },
							],
							nextRequestId: state.nextRequestId + 1,
						},
			),
		shift: (requestId) =>
			set((state) =>
				state.queue[0]?.requestId === requestId
					? { queue: state.queue.slice(1) }
					: state,
			),
	}),
);
