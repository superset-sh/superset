import { create } from "zustand";

/**
 * A request, made from outside the workspace route, to open a workspace's
 * pull-request pane once that workspace's pane layout is ready. Mirrors the
 * page-pane intent: the requester navigates to the workspace, and the
 * workspace page consumes the intent on arrival.
 */
export interface PullRequestPaneIntent {
	workspaceId: string;
	prNumber: number;
}

interface PullRequestPaneIntentState {
	intent: PullRequestPaneIntent | null;
	request: (intent: PullRequestPaneIntent) => void;
	consume: (workspaceId: string) => PullRequestPaneIntent | null;
}

export const usePullRequestPaneIntent = create<PullRequestPaneIntentState>(
	(set, get) => ({
		intent: null,
		request: (intent) => set({ intent }),
		consume: (workspaceId) => {
			const { intent } = get();
			if (!intent || intent.workspaceId !== workspaceId) return null;
			set({ intent: null });
			return intent;
		},
	}),
);
