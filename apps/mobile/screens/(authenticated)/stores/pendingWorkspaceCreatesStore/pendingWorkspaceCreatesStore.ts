import { create } from "zustand";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

/**
 * Everything needed to re-run a create verbatim from the failed screen, plus
 * the labels the interstitials display (`projectName · branchLabel`, the
 * agent being started).
 */
export interface PendingWorkspaceCreateInput {
	target: {
		projectId: string;
		machineId: string;
		hostUrl: string;
		projectName: string;
	};
	baseBranch: string | null;
	/**
	 * Display only. Null while the branch list is still loading — the create
	 * itself sends `baseBranch`, and the host picks its own default when that is
	 * absent, so there is no name to show yet and inventing one would show a
	 * branch that does not exist.
	 */
	branchLabel: string | null;
	agentId: string;
	agentLabel: string;
	/** Null launches the agent's own default. */
	model: string | null;
	effort: string | null;
	message: PromptInputMessage;
	/**
	 * The message's attachments, already in cloud storage. Resolved before the
	 * create is recorded so a retry replays the same ids: the bytes went up
	 * once, when the files were attached, and the local URIs they came from
	 * are gone with the draft by the time the failed screen offers a retry.
	 */
	attachmentFileIds: string[];
}

/**
 * Why a create stopped short of a row. `unknown` is the honest answer to a
 * failure in transport: the request never got an answer, so the host may have
 * finished the worktree anyway. The workspace screen keeps polling either way
 * and heals itself if the row turns up, so the distinction is only about what
 * the user is told and what the retry button does.
 */
export interface PendingWorkspaceCreateFailure {
	outcome: "failed" | "unknown";
	/** Display copy — already mapped and safe to show. */
	message: string;
}

export interface PendingWorkspaceCreate {
	workspaceId: string;
	/** Host machineId — keys the host-scoped query invalidations. */
	hostId: string;
	hostUrl: string;
	startedAt: number;
	input: PendingWorkspaceCreateInput;
	/** Set on failure — the workspace screen swaps to the failed state. */
	failure: PendingWorkspaceCreateFailure | null;
}

interface PendingWorkspaceCreatesStore {
	pendingById: Record<string, PendingWorkspaceCreate>;
	start: (entry: Omit<PendingWorkspaceCreate, "failure">) => void;
	fail: (workspaceId: string, failure: PendingWorkspaceCreateFailure) => void;
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
					[entry.workspaceId]: { ...entry, failure: null },
				},
			})),
		fail: (workspaceId, failure) =>
			set((state) => {
				const entry = state.pendingById[workspaceId];
				if (!entry) return state;
				return {
					pendingById: {
						...state.pendingById,
						[workspaceId]: { ...entry, failure },
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
