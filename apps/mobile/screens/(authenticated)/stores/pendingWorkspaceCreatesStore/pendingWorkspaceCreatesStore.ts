import { create } from "zustand";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

/**
 * Everything needed to re-run a create verbatim from the failed screen, plus
 * the labels the interstitials display (`projectName · branchLabel`, the
 * agent being started). Attachments re-upload from their local URIs.
 */
export interface PendingWorkspaceCreateInput {
	target: {
		projectId: string;
		machineId: string;
		hostUrl: string;
		projectName: string;
	};
	baseBranch: string | null;
	branchLabel: string;
	agentId: string;
	agentLabel: string;
	message: PromptInputMessage;
}

export interface PendingWorkspaceCreate {
	workspaceId: string;
	/** Host machineId — keys the host-scoped query invalidations. */
	hostId: string;
	hostUrl: string;
	startedAt: number;
	input: PendingWorkspaceCreateInput;
	/** Set on failure — the workspace screen swaps to the failed state. */
	error: string | null;
}

interface PendingWorkspaceCreatesStore {
	pendingById: Record<string, PendingWorkspaceCreate>;
	start: (entry: Omit<PendingWorkspaceCreate, "error">) => void;
	fail: (workspaceId: string, error: string) => void;
	clear: (workspaceId: string) => void;
}

/**
 * Workspace creates in flight on a host. `workspaces.createEnqueued` returns
 * before the worktree exists, so the workspace screen needs to know the id it
 * navigated to is still being created rather than missing. In-memory only: a
 * create that outlives the app process surfaces as a regular row in the home
 * list once the host finishes it.
 */
export const usePendingWorkspaceCreatesStore =
	create<PendingWorkspaceCreatesStore>()((set) => ({
		pendingById: {},
		start: (entry) =>
			set((state) => ({
				pendingById: {
					...state.pendingById,
					[entry.workspaceId]: { ...entry, error: null },
				},
			})),
		fail: (workspaceId, error) =>
			set((state) => {
				const entry = state.pendingById[workspaceId];
				if (!entry) return state;
				return {
					pendingById: {
						...state.pendingById,
						[workspaceId]: { ...entry, error },
					},
				};
			}),
		clear: (workspaceId) =>
			set((state) => {
				if (!state.pendingById[workspaceId]) return state;
				const { [workspaceId]: _removed, ...pendingById } = state.pendingById;
				return { pendingById };
			}),
	}));
