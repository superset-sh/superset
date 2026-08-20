import { create } from "zustand";

export type LinkedIssue = {
	slug: string;
	title: string;
	source?: "github" | "internal";
	url?: string;
	taskId?: string;
	/** Provider branch name (e.g. Linear's), synced into `tasks.branch`. */
	branch?: string;
	number?: number;
	state?: "open" | "closed";
};

export type LinkedPR = {
	prNumber: number;
	title: string;
	url: string;
	state: string;
};

export type BaseBranchSource = "local" | "remote-tracking";

export interface DraftAttachment {
	localId: string;
	state: "uploading" | "ready" | "error";
	file: { name: string; size: number; mediaType: string };
	attachmentId?: string;
	error?: string;
}

export interface NewWorkspaceDraft {
	selectedProjectId: string | null;
	/** Explicit "No project" (session) choice — distinct from not-yet-selected. */
	isSession: boolean;
	hostId: string | null;
	prompt: string;
	baseBranch: string | null;
	baseBranchSource: BaseBranchSource | null;
	workspaceName: string;
	workspaceNameEdited: boolean;
	branchName: string;
	branchNameEdited: boolean;
	/**
	 * True while branchName is the provider's own branch name (Linear's
	 * branchName) seeded by linking an issue. Cleared on manual edits.
	 * Provider branches are created verbatim — no project branch prefix.
	 */
	branchNameFromProvider: boolean;
	linkedIssues: LinkedIssue[];
	linkedPR: LinkedPR | null;
	selectedAgentId: string | null;
	attachments: DraftAttachment[];
}

interface NewWorkspaceDraftState extends NewWorkspaceDraft {
	resetKey: number;
	updateDraft: (patch: Partial<NewWorkspaceDraft>) => void;
	selectProject: (projectId: string) => void;
	selectSession: () => void;
	addAttachment: (attachment: DraftAttachment) => void;
	updateAttachment: (localId: string, patch: Partial<DraftAttachment>) => void;
	removeAttachment: (localId: string) => void;
	resetDraft: () => void;
}

function buildInitialDraft(): NewWorkspaceDraft {
	return {
		selectedProjectId: null,
		isSession: false,
		hostId: null,
		prompt: "",
		baseBranch: null,
		baseBranchSource: null,
		workspaceName: "",
		workspaceNameEdited: false,
		branchName: "",
		branchNameEdited: false,
		branchNameFromProvider: false,
		linkedIssues: [],
		linkedPR: null,
		selectedAgentId: null,
		attachments: [],
	};
}

export const useNewWorkspaceDraftStore = create<NewWorkspaceDraftState>(
	(set) => ({
		...buildInitialDraft(),
		resetKey: 0,
		updateDraft: (patch) => set((state) => ({ ...state, ...patch })),
		// The only writers of the selectedProjectId/isSession pair — a project
		// selection that leaves isSession behind makes submit reject PR
		// checkouts while the picker shows the project as selected.
		selectProject: (projectId) =>
			set({ selectedProjectId: projectId, isSession: false }),
		// Sessions can't check out a PR or fork a branch — clear the
		// repo-scoped inputs instead of failing at submit.
		selectSession: () =>
			set({
				selectedProjectId: null,
				isSession: true,
				linkedPR: null,
				baseBranch: null,
				baseBranchSource: null,
			}),
		addAttachment: (attachment) =>
			set((state) => ({
				...state,
				attachments: [...state.attachments, attachment],
			})),
		updateAttachment: (localId, patch) =>
			set((state) => ({
				...state,
				attachments: state.attachments.map((entry) =>
					entry.localId === localId ? { ...entry, ...patch } : entry,
				),
			})),
		removeAttachment: (localId) =>
			set((state) => ({
				...state,
				attachments: state.attachments.filter(
					(entry) => entry.localId !== localId,
				),
			})),
		// set() merges, so the store's actions survive the reset.
		// hostId is a target preference, not draft content: someone who just
		// created in the cloud means the next one to go there too. The persisted
		// lastHostId only re-seeds a draft once per create surface open, and the
		// main create surface never closes, so the reset has to carry it — the
		// alternative is a silent create on the wrong machine.
		resetDraft: () =>
			set((state) => ({
				...buildInitialDraft(),
				hostId: state.hostId,
				resetKey: state.resetKey + 1,
			})),
	}),
);
