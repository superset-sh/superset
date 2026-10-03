import { create } from "zustand";

/**
 * Asks a workspace to show one agent session's terminal when it next opens.
 *
 * The Sessions list lives outside the workspace route and so has no pane
 * store to write to, and neither of the route's own paths covers this: pane
 * adoption only picks up terminals the daemon still holds, and a dead
 * session resumes from a pane already pointing at it, which a workspace this
 * client has never opened does not have. Without a request, clicking a row
 * lands on an empty workspace.
 *
 * Kept per workspace, since a navigation can be superseded before the target
 * route mounts, and consumed exactly once by the workspace that claims it.
 */
interface OpenSessionIntentState {
	/** workspaceId -> terminalId to focus or open on arrival. */
	requests: Record<string, string>;
	request: (workspaceId: string, terminalId: string) => void;
	claim: (workspaceId: string) => string | undefined;
}

export const useOpenSessionIntent = create<OpenSessionIntentState>(
	(set, get) => ({
		requests: {},
		request: (workspaceId, terminalId) =>
			set((state) => ({
				requests: { ...state.requests, [workspaceId]: terminalId },
			})),
		claim: (workspaceId) => {
			const terminalId = get().requests[workspaceId];
			if (terminalId === undefined) return undefined;
			set((state) => {
				const { [workspaceId]: _claimed, ...rest } = state.requests;
				return { requests: rest };
			});
			return terminalId;
		},
	}),
);
